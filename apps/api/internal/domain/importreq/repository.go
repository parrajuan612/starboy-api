package importreq

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/juancamiloparra/starboy-api/internal/models"
)

var errNotFound = errors.New("no encontrado")

// ListFilter filtra el listado. UserID != nil limita a los encargos de ese cliente.
type ListFilter struct {
	UserID        *uuid.UUID
	Status        string
	CodeContains  string
	Offset, Limit int
	WithHistory   bool
}

// Repository es el acceso a datos de los encargos.
type Repository interface {
	ListActiveRates(ctx context.Context) ([]models.ImportRate, error)
	RatesByIDs(ctx context.Context, ids []uuid.UUID) ([]models.ImportRate, error)
	FindUser(ctx context.Context, id uuid.UUID) (*models.User, error)

	// Tarifas por categoría (administración)
	ListAllRates(ctx context.Context) ([]models.ImportRate, error)
	GetRate(ctx context.Context, id uuid.UUID) (*models.ImportRate, error)
	CreateRate(ctx context.Context, r *models.ImportRate) error
	SaveRate(ctx context.Context, r *models.ImportRate) error

	// CreateRequest guarda encargo + ítems + historial inicial en una transacción
	// (y, si setDocumentID != nil, la cédula del cliente).
	CreateRequest(ctx context.Context, r *models.ImportRequest, setDocumentID *string) error
	List(ctx context.Context, f ListFilter) ([]models.ImportRequest, int64, error)
	Get(ctx context.Context, id uuid.UUID) (*models.ImportRequest, error)
	// ChangeStatus bloquea el encargo, deja que `apply` valide y mute, y guarda el cambio
	// junto con su entrada de historial en la misma transacción.
	ChangeStatus(ctx context.Context, id uuid.UUID,
		apply func(r *models.ImportRequest) (*models.ImportStatusHistory, error)) error
	// RequestRequote bloquea el encargo y deja que `apply` valide y marque la petición de nueva cotización.
	RequestRequote(ctx context.Context, id uuid.UUID,
		apply func(r *models.ImportRequest) (*models.ImportStatusHistory, error)) error

	// CreateQuote emite una versión nueva: bloquea el encargo, invalida las cotizaciones SENT
	// anteriores, guarda la cotización, mueve el encargo a QUOTED y escribe el historial.
	CreateQuote(ctx context.Context, requestID uuid.UUID,
		build func(r *models.ImportRequest, items []models.ImportRequestItem, nextVersion int) (*models.ImportQuote, *models.ImportStatusHistory, error)) error
	// AcceptQuote bloquea encargo y cotización, valida con `apply` y guarda ambos cambios + historial.
	AcceptQuote(ctx context.Context, requestID, quoteID uuid.UUID,
		apply func(r *models.ImportRequest, q *models.ImportQuote) (*models.ImportStatusHistory, error)) error
}

type gormRepository struct{ db *gorm.DB }

// NewRepository crea el repositorio GORM.
func NewRepository(db *gorm.DB) Repository { return &gormRepository{db: db} }

func (r *gormRepository) ListActiveRates(ctx context.Context) ([]models.ImportRate, error) {
	var rates []models.ImportRate
	err := r.db.WithContext(ctx).Where("is_active").Order("sort_order ASC, name ASC").Find(&rates).Error
	return rates, err
}

func (r *gormRepository) RatesByIDs(ctx context.Context, ids []uuid.UUID) ([]models.ImportRate, error) {
	var rates []models.ImportRate
	err := r.db.WithContext(ctx).Where("id IN ? AND is_active", ids).Find(&rates).Error
	return rates, err
}

func (r *gormRepository) FindUser(ctx context.Context, id uuid.UUID) (*models.User, error) {
	var u models.User
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&u).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errNotFound
		}
		return nil, err
	}
	return &u, nil
}

func (r *gormRepository) CreateRequest(ctx context.Context, req *models.ImportRequest, setDocumentID *string) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if setDocumentID != nil && req.UserID != nil {
			if err := tx.Model(&models.User{}).Where("id = ?", *req.UserID).
				Update("document_id", *setDocumentID).Error; err != nil {
				return err
			}
		}
		// BeforeCreate toma el código de import_request_code_seq; ítems e historial se crean con el padre.
		return tx.Create(req).Error
	})
}

func latestQuotesFirst(db *gorm.DB) *gorm.DB { return db.Order("version DESC") }

func orderedHistory(db *gorm.DB) *gorm.DB { return db.Order("created_at ASC, id ASC") }

func (r *gormRepository) List(ctx context.Context, f ListFilter) ([]models.ImportRequest, int64, error) {
	build := func() *gorm.DB {
		q := r.db.WithContext(ctx).Model(&models.ImportRequest{})
		if f.UserID != nil {
			q = q.Where("import_requests.user_id = ?", *f.UserID)
		}
		if f.Status != "" {
			q = q.Where("import_requests.status = ?", f.Status)
		}
		if f.CodeContains != "" {
			q = q.Where("import_requests.code ILIKE ?", "%"+escapeLike(f.CodeContains)+"%")
		}
		return q
	}
	var total int64
	if err := build().Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if total == 0 || f.Offset >= int(total) {
		return []models.ImportRequest{}, total, nil
	}
	q := build().Preload("User").Preload("Items").Preload("Items.ImportRate").Preload("Quotes", latestQuotesFirst)
	if f.WithHistory {
		q = q.Preload("History", orderedHistory)
	}
	var items []models.ImportRequest
	if err := q.Order("import_requests.created_at DESC, import_requests.id").
		Offset(f.Offset).Limit(f.Limit).Find(&items).Error; err != nil {
		return nil, 0, err
	}
	ptrs := make([]*models.ImportRequest, len(items))
	for i := range items {
		ptrs[i] = &items[i]
	}
	if err := markBalancePaid(r.db.WithContext(ctx), ptrs); err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

func (r *gormRepository) Get(ctx context.Context, id uuid.UUID) (*models.ImportRequest, error) {
	var req models.ImportRequest
	err := r.db.WithContext(ctx).
		Preload("User").Preload("Items").Preload("Items.ImportRate").
		Preload("History", orderedHistory).Preload("Quotes", latestQuotesFirst).
		Where("id = ?", id).First(&req).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, errNotFound
	}
	if err != nil {
		return nil, err
	}
	if err := markBalancePaid(r.db.WithContext(ctx), []*models.ImportRequest{&req}); err != nil {
		return nil, err
	}
	return &req, nil
}

// markBalancePaid marca los encargos que ya tienen un pago BALANCE aprobado.
func markBalancePaid(db *gorm.DB, reqs []*models.ImportRequest) error {
	if len(reqs) == 0 {
		return nil
	}
	ids := make([]uuid.UUID, 0, len(reqs))
	for _, r := range reqs {
		ids = append(ids, r.ID)
	}
	var paid []uuid.UUID
	if err := db.Model(&models.Payment{}).
		Where("import_request_id IN ? AND kind = ? AND status = ?", ids, models.PaymentBalance, models.PaymentApproved).
		Distinct().Pluck("import_request_id", &paid).Error; err != nil {
		return err
	}
	set := make(map[uuid.UUID]bool, len(paid))
	for _, id := range paid {
		set[id] = true
	}
	for _, r := range reqs {
		r.BalancePaid = set[r.ID]
	}
	return nil
}

func (r *gormRepository) RequestRequote(ctx context.Context, id uuid.UUID,
	apply func(*models.ImportRequest) (*models.ImportStatusHistory, error)) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		req, err := lockRequest(tx, id)
		if err != nil {
			return err
		}
		if err := tx.Preload("Quotes", latestQuotesFirst).Where("id = ?", id).First(req).Error; err != nil {
			return err
		}
		h, err := apply(req)
		if err != nil {
			return err
		}
		req.UpdatedAt = time.Now().UTC()
		if err := tx.Select("requote_requested_at", "updated_at").Where("id = ?", id).Updates(req).Error; err != nil {
			return err
		}
		h.ImportRequestID = id
		return tx.Create(h).Error
	})
}

func (r *gormRepository) ChangeStatus(ctx context.Context, id uuid.UUID,
	apply func(*models.ImportRequest) (*models.ImportStatusHistory, error)) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var req models.ImportRequest
		err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", id).First(&req).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errNotFound
		}
		if err != nil {
			return err
		}
		// La regla «no se despacha sin saldo» necesita la cotización y los pagos, leídos con el encargo bloqueado.
		if err := tx.Preload("Quotes", latestQuotesFirst).Where("id = ?", id).First(&req).Error; err != nil {
			return err
		}
		if err := markBalancePaid(tx, []*models.ImportRequest{&req}); err != nil {
			return err
		}
		h, err := apply(&req)
		if err != nil {
			return err
		}
		req.UpdatedAt = time.Now().UTC()
		if err := tx.Select("status", "carrier_usa", "tracking_usa", "tracking_co", "weight_lb", "eta", "updated_at").
			Where("id = ?", id).Updates(&req).Error; err != nil {
			return err
		}
		h.ImportRequestID = id
		// GORM reemplaza un bool en false por el default del tag (true) al crear: se corrige después.
		notify := h.NotifyCustomer
		if err := tx.Create(h).Error; err != nil {
			return err
		}
		if !notify {
			return tx.Model(h).UpdateColumn("notify_customer", false).Error
		}
		return nil
	})
}

func escapeLike(s string) string {
	out := make([]rune, 0, len(s))
	for _, c := range s {
		if c == '\\' || c == '%' || c == '_' {
			out = append(out, '\\')
		}
		out = append(out, c)
	}
	return string(out)
}

// lockRequest bloquea la fila del encargo durante la transacción.
func lockRequest(tx *gorm.DB, id uuid.UUID) (*models.ImportRequest, error) {
	var req models.ImportRequest
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", id).First(&req).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, errNotFound
	}
	return &req, err
}

func saveStatus(tx *gorm.DB, req *models.ImportRequest, h *models.ImportStatusHistory) error {
	req.UpdatedAt = time.Now().UTC()
	if err := tx.Select("status", "updated_at", "requote_requested_at").Where("id = ?", req.ID).Updates(req).Error; err != nil {
		return err
	}
	h.ImportRequestID = req.ID
	return tx.Create(h).Error
}

func (r *gormRepository) CreateQuote(ctx context.Context, requestID uuid.UUID,
	build func(*models.ImportRequest, []models.ImportRequestItem, int) (*models.ImportQuote, *models.ImportStatusHistory, error)) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		req, err := lockRequest(tx, requestID)
		if err != nil {
			return err
		}
		var items []models.ImportRequestItem
		if err := tx.Preload("ImportRate").Where("import_request_id = ?", requestID).
			Order("created_at ASC, id ASC").Find(&items).Error; err != nil {
			return err
		}
		var last int
		if err := tx.Model(&models.ImportQuote{}).Where("import_request_id = ?", requestID).
			Select("COALESCE(MAX(version), 0)").Scan(&last).Error; err != nil {
			return err
		}
		quote, hist, err := build(req, items, last+1)
		if err != nil {
			return err
		}
		// La cotización anterior deja de ser aceptable: solo la última versión se puede aceptar.
		if err := tx.Model(&models.ImportQuote{}).
			Where("import_request_id = ? AND status = ?", requestID, models.QuoteSent).
			Update("status", models.QuoteExpired).Error; err != nil {
			return err
		}
		quote.ImportRequestID = requestID
		if err := tx.Create(quote).Error; err != nil {
			return err
		}
		req.RequoteRequestedAt = nil // la nueva cotización atiende la petición del cliente
		return saveStatus(tx, req, hist)
	})
}

func (r *gormRepository) AcceptQuote(ctx context.Context, requestID, quoteID uuid.UUID,
	apply func(*models.ImportRequest, *models.ImportQuote) (*models.ImportStatusHistory, error)) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		req, err := lockRequest(tx, requestID)
		if err != nil {
			return err
		}
		var q models.ImportQuote
		err = tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ? AND import_request_id = ?", quoteID, requestID).First(&q).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errNotFound
		}
		if err != nil {
			return err
		}
		hist, err := apply(req, &q)
		if err != nil {
			return err
		}
		if err := tx.Select("status", "updated_at").Where("id = ?", q.ID).Updates(&q).Error; err != nil {
			return err
		}
		return saveStatus(tx, req, hist)
	})
}

// ---------- Tarifas por categoría ----------

var errRateExists = errors.New("ya existe una tarifa con ese nombre")

func (r *gormRepository) ListAllRates(ctx context.Context) ([]models.ImportRate, error) {
	var rates []models.ImportRate
	err := r.db.WithContext(ctx).Order("sort_order ASC, name ASC").Find(&rates).Error
	return rates, err
}

func (r *gormRepository) GetRate(ctx context.Context, id uuid.UUID) (*models.ImportRate, error) {
	var rate models.ImportRate
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&rate).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errNotFound
		}
		return nil, err
	}
	return &rate, nil
}

func (r *gormRepository) CreateRate(ctx context.Context, rate *models.ImportRate) error {
	active := rate.IsActive
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(rate).Error; err != nil {
			return err
		}
		if !active { // GORM reemplaza un false por el default del tag (true) al crear
			return tx.Model(rate).UpdateColumn("is_active", false).Error
		}
		return nil
	})
	if errors.Is(err, gorm.ErrDuplicatedKey) {
		return errRateExists
	}
	return err
}

func (r *gormRepository) SaveRate(ctx context.Context, rate *models.ImportRate) error {
	err := r.db.WithContext(ctx).
		Select("name", "avg_weight_lb", "freight_cop", "handling_cop", "insurance_cop", "national_delivery_cop",
			"margin_cop", "flat_fee_cop", "max_declared_usd_cents", "requires_manual_quote", "notes", "is_active",
			"sort_order", "updated_at").
		Where("id = ?", rate.ID).Updates(rate).Error
	if errors.Is(err, gorm.ErrDuplicatedKey) {
		return errRateExists
	}
	return err
}
