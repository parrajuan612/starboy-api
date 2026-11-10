package payment

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/juancamiloparra/starboy-api/internal/domain/inventory"
	"github.com/juancamiloparra/starboy-api/internal/models"
)

var (
	errNotFound = errors.New("no encontrado")
	// errNoChange: la regla decidió que no hay nada que guardar (evento repetido). Confirma sin escribir.
	errNoChange = errors.New("sin cambios")
)

// CheckoutContext es lo que la regla de negocio necesita para decidir el cobro.
type CheckoutContext struct {
	Import   *models.ImportRequest
	Quote    *models.ImportQuote // cotización ACCEPTED, nil si no hay
	Existing []models.Payment    // pagos previos del encargo
}

// OrderCheckoutContext es el estado bloqueado de una orden al abrir su cobro.
type OrderCheckoutContext struct {
	Order    *models.Order
	Existing []models.Payment
}

// EventContext es el estado bloqueado sobre el que se aplica una notificación de la pasarela.
type EventContext struct {
	Payment        *models.Payment
	Import         *models.ImportRequest // nil si el pago no es de un encargo
	Order          *models.Order         // nil si el pago no es de una orden
	OrderItems     []models.OrderItem
	Variants       map[uuid.UUID]models.ProductVariant // variantes de la orden, ya bloqueadas
	ApprovedExists bool                                // ya hay otro pago APPROVED del mismo tipo
}

// Effects son los cambios que la regla de negocio pide guardar junto con el pago.
type Effects struct {
	ImportHistory *models.ImportStatusHistory // el encargo ya fue mutado en ec.Import
	OrderHistory  *models.OrderStatusHistory  // la orden ya fue mutada en ec.Order
	CommitStock   bool                        // descuenta el stock reservado de la orden
}

// ListFilter filtra el listado de administración.
type ListFilter struct {
	Status          string
	ImportRequestID *uuid.UUID
	OrderID         *uuid.UUID
	Offset, Limit   int
}

// Repository es el acceso a datos de pagos. Las operaciones que cambian dinero y estado
// reciben la regla como función y corren completas dentro de una sola transacción.
type Repository interface {
	// Checkout bloquea el encargo, arma el contexto y, si `decide` devuelve un pago nuevo, lo inserta.
	// Si devuelve uno existente (isNew=false) no escribe nada.
	Checkout(ctx context.Context, importID uuid.UUID,
		decide func(cc *CheckoutContext) (p *models.Payment, isNew bool, err error)) (*models.Payment, error)
	// CheckoutOrder es Checkout para una orden de la tienda.
	CheckoutOrder(ctx context.Context, orderID uuid.UUID,
		decide func(oc *OrderCheckoutContext) (p *models.Payment, isNew bool, err error)) (*models.Payment, error)
	// ApplyEvent bloquea pago, encargo u orden y sus variantes (siempre en ese orden), ejecuta
	// `apply` y guarda todo de forma atómica. Si `apply` falla, no se guarda nada.
	ApplyEvent(ctx context.Context, provider models.PaymentProvider, providerRef string,
		apply func(ec *EventContext) (*Effects, error)) (*models.Payment, error)
	Get(ctx context.Context, id uuid.UUID) (*models.Payment, error)
	// OwnerOf devuelve el dueño del pago (nil si es de un lote propio o un invitado).
	OwnerOf(ctx context.Context, p *models.Payment) (*uuid.UUID, error)
	List(ctx context.Context, f ListFilter) ([]models.Payment, int64, error)
}

type gormRepository struct{ db *gorm.DB }

// NewRepository crea el repositorio GORM.
func NewRepository(db *gorm.DB) Repository { return &gormRepository{db: db} }

func lockImport(tx *gorm.DB, id uuid.UUID) (*models.ImportRequest, error) {
	var r models.ImportRequest
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", id).First(&r).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, errNotFound
	}
	return &r, err
}

func (r *gormRepository) Checkout(ctx context.Context, importID uuid.UUID,
	decide func(*CheckoutContext) (*models.Payment, bool, error)) (*models.Payment, error) {
	var out *models.Payment
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Con el encargo bloqueado, dos checkouts simultáneos se serializan y no duplican el cobro.
		imp, err := lockImport(tx, importID)
		if err != nil {
			return err
		}
		cc := &CheckoutContext{Import: imp}
		var q models.ImportQuote
		switch err := tx.Where("import_request_id = ? AND status = ?", importID, models.QuoteAccepted).
			Order("version DESC").First(&q).Error; {
		case err == nil:
			cc.Quote = &q
		case !errors.Is(err, gorm.ErrRecordNotFound):
			return err
		}
		if err := tx.Where("import_request_id = ?", importID).Order("created_at ASC").Find(&cc.Existing).Error; err != nil {
			return err
		}
		p, isNew, err := decide(cc)
		if err != nil {
			return err
		}
		if isNew {
			if err := tx.Create(p).Error; err != nil {
				return err
			}
		}
		out = p
		return nil
	})
	return out, err
}

func (r *gormRepository) CheckoutOrder(ctx context.Context, orderID uuid.UUID,
	decide func(*OrderCheckoutContext) (*models.Payment, bool, error)) (*models.Payment, error) {
	var out *models.Payment
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var o models.Order
		err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", orderID).First(&o).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errNotFound
		}
		if err != nil {
			return err
		}
		oc := &OrderCheckoutContext{Order: &o}
		if err := tx.Where("order_id = ?", orderID).Order("created_at ASC").Find(&oc.Existing).Error; err != nil {
			return err
		}
		p, isNew, err := decide(oc)
		if err != nil {
			return err
		}
		if isNew {
			if err := tx.Create(p).Error; err != nil {
				return err
			}
		}
		out = p
		return nil
	})
	return out, err
}

func (r *gormRepository) ApplyEvent(ctx context.Context, provider models.PaymentProvider, providerRef string,
	apply func(*EventContext) (*Effects, error)) (*models.Payment, error) {
	var out *models.Payment
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var p models.Payment
		err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("provider = ? AND provider_ref = ?", provider, providerRef).First(&p).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errNotFound
		}
		if err != nil {
			return err
		}
		out = &p
		ec := &EventContext{Payment: &p}
		approvedQ := tx.Model(&models.Payment{}).Where("kind = ? AND status = ? AND id <> ?", p.Kind, models.PaymentApproved, p.ID)

		switch {
		case p.ImportRequestID != nil:
			if ec.Import, err = lockImport(tx, *p.ImportRequestID); err != nil {
				return err
			}
			var n int64
			if err := approvedQ.Where("import_request_id = ?", *p.ImportRequestID).Count(&n).Error; err != nil {
				return err
			}
			ec.ApprovedExists = n > 0
		case p.OrderID != nil:
			var o models.Order
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", *p.OrderID).First(&o).Error; err != nil {
				return err
			}
			ec.Order = &o
			if err := tx.Where("order_id = ?", o.ID).Find(&ec.OrderItems).Error; err != nil {
				return err
			}
			variantIDs := make([]uuid.UUID, 0, len(ec.OrderItems))
			for _, it := range ec.OrderItems {
				variantIDs = append(variantIDs, it.VariantID)
			}
			if ec.Variants, err = inventory.LockVariants(tx, variantIDs); err != nil {
				return err
			}
			var n int64
			if err := approvedQ.Where("order_id = ?", o.ID).Count(&n).Error; err != nil {
				return err
			}
			ec.ApprovedExists = n > 0
		}

		eff, err := apply(ec)
		if errors.Is(err, errNoChange) {
			return nil
		}
		if err != nil {
			return err
		}

		now := time.Now().UTC()
		p.UpdatedAt = now
		if err := tx.Select("status", "raw_payload", "updated_at").Where("id = ?", p.ID).Updates(&p).Error; err != nil {
			return err
		}
		if eff == nil {
			return nil
		}
		if eff.ImportHistory != nil && ec.Import != nil {
			ec.Import.UpdatedAt = now
			if err := tx.Select("status", "updated_at").Where("id = ?", ec.Import.ID).Updates(ec.Import).Error; err != nil {
				return err
			}
			eff.ImportHistory.ImportRequestID = ec.Import.ID
			if err := tx.Create(eff.ImportHistory).Error; err != nil {
				return err
			}
		}
		if eff.OrderHistory != nil && ec.Order != nil {
			ec.Order.UpdatedAt = now
			if err := tx.Select("status", "reserved_until", "updated_at").Where("id = ?", ec.Order.ID).Updates(ec.Order).Error; err != nil {
				return err
			}
			eff.OrderHistory.OrderID = ec.Order.ID
			if err := tx.Create(eff.OrderHistory).Error; err != nil {
				return err
			}
			if eff.CommitStock { // pago aprobado: lo reservado pasa a vendido
				lines := make([]inventory.Line, 0, len(ec.OrderItems))
				for _, it := range ec.OrderItems {
					lines = append(lines, inventory.Line{VariantID: it.VariantID, Quantity: it.Quantity})
				}
				if err := inventory.Commit(tx, lines, inventory.Meta{
					OrderID: &ec.Order.ID, Reason: "Pago aprobado: las unidades reservadas pasan a vendidas",
				}); err != nil {
					return err
				}
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

func (r *gormRepository) Get(ctx context.Context, id uuid.UUID) (*models.Payment, error) {
	var p models.Payment
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&p).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errNotFound
		}
		return nil, err
	}
	return &p, nil
}

func (r *gormRepository) OwnerOf(ctx context.Context, p *models.Payment) (*uuid.UUID, error) {
	if p.OrderID != nil {
		var o models.Order
		if err := r.db.WithContext(ctx).Select("id", "user_id").Where("id = ?", *p.OrderID).First(&o).Error; err != nil {
			return nil, err
		}
		return o.UserID, nil
	}
	if p.ImportRequestID == nil {
		return nil, nil
	}
	var imp models.ImportRequest
	err := r.db.WithContext(ctx).Select("id", "user_id").Where("id = ?", *p.ImportRequestID).First(&imp).Error
	if err != nil {
		return nil, err
	}
	return imp.UserID, nil
}

func (r *gormRepository) List(ctx context.Context, f ListFilter) ([]models.Payment, int64, error) {
	build := func() *gorm.DB {
		q := r.db.WithContext(ctx).Model(&models.Payment{})
		if f.Status != "" {
			q = q.Where("status = ?", f.Status)
		}
		if f.ImportRequestID != nil {
			q = q.Where("import_request_id = ?", *f.ImportRequestID)
		}
		if f.OrderID != nil {
			q = q.Where("order_id = ?", *f.OrderID)
		}
		return q
	}
	var total int64
	if err := build().Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if total == 0 || f.Offset >= int(total) {
		return []models.Payment{}, total, nil
	}
	var items []models.Payment
	err := build().Order("created_at DESC, id").Offset(f.Offset).Limit(f.Limit).Find(&items).Error
	return items, total, err
}
