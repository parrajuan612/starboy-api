package order

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

var errNotFound = errors.New("no encontrado")

// Idempotency identifica un intento de compra de un usuario.
type Idempotency struct {
	UserID uuid.UUID
	Key    string
}

// ExistingOrderError: la llave de idempotencia ya creó esta orden.
type ExistingOrderError struct{ OrderID uuid.UUID }

func (e *ExistingOrderError) Error() string { return "la orden ya fue creada con esta llave" }

// PricedVariant junta la variante bloqueada con su producto para poder fijar el precio.
type PricedVariant struct {
	Variant models.ProductVariant
	Product models.Product
}

// Repository es el acceso a datos de las órdenes.
type Repository interface {
	// CreateOrder, dentro de UNA transacción: bloquea las variantes, deja que `build` valide y fije
	// precios, reserva el stock y guarda orden + ítems + historial. Si algo falla no queda nada.
	// Si `idem.Key` no está vacía y el usuario ya tiene una orden con esa llave, no reserva nada y devuelve *ExistingOrderError.
	CreateOrder(ctx context.Context, variantIDs []uuid.UUID, idem Idempotency,
		build func(vs map[uuid.UUID]PricedVariant) (*models.Order, []inventory.Line, error)) error
	Get(ctx context.Context, id uuid.UUID) (*models.Order, error)
	FindByKey(ctx context.Context, userID uuid.UUID, key string) (*models.Order, error)
	ListByUser(ctx context.Context, userID uuid.UUID, status string, offset, limit int) ([]models.Order, int64, error)
	// ExpireStale cancela las órdenes sin pago cuya reserva venció y libera su stock.
	ExpireStale(ctx context.Context, now time.Time) (int, error)

	// Panel (ADMIN y STAFF).
	ListAll(ctx context.Context, f AdminFilter, offset, limit int) ([]models.Order, int64, error)
	GetForAdmin(ctx context.Context, id uuid.UUID) (*models.Order, error)
	// ChangeStatus, dentro de UNA transacción: bloquea la orden, deja que `decide` valide la
	// transición contra el estado real, mueve el stock si corresponde y registra el historial.
	ChangeStatus(ctx context.Context, id, actorID uuid.UUID, decide func(cur *models.Order) (Change, error)) (*StatusResult, error)
}

type gormRepository struct{ db *gorm.DB }

// NewRepository crea el repositorio GORM.
func NewRepository(db *gorm.DB) Repository { return &gormRepository{db: db} }

func (r *gormRepository) CreateOrder(ctx context.Context, variantIDs []uuid.UUID, idem Idempotency,
	build func(map[uuid.UUID]PricedVariant) (*models.Order, []inventory.Line, error)) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		locked, err := inventory.LockVariants(tx, variantIDs)
		if err != nil {
			return err
		}
		// Con las variantes bloqueadas, una petición gemela (mismo doble clic) espera aquí a que la primera
		// termine y entonces ve su orden: así nunca se reserva dos veces ni se responde «sin stock» por error.
		if idem.Key != "" {
			var prev models.Order
			err := tx.Select("id").Where("user_id = ? AND idempotency_key = ?", idem.UserID, idem.Key).First(&prev).Error
			if err == nil {
				return &ExistingOrderError{OrderID: prev.ID}
			}
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
		}
		productIDs := make([]uuid.UUID, 0, len(locked))
		for _, v := range locked {
			productIDs = append(productIDs, v.ProductID)
		}
		// Solo productos publicados y de marcas activas se pueden comprar.
		var products []models.Product
		if len(productIDs) > 0 {
			if err := tx.Where("id IN ? AND status = ? AND brand_id IN (SELECT id FROM brands WHERE is_active)",
				productIDs, models.ProductActive).Find(&products).Error; err != nil {
				return err
			}
		}
		byProduct := make(map[uuid.UUID]models.Product, len(products))
		for _, p := range products {
			byProduct[p.ID] = p
		}
		priced := make(map[uuid.UUID]PricedVariant, len(locked))
		for id, v := range locked {
			if p, ok := byProduct[v.ProductID]; ok {
				priced[id] = PricedVariant{Variant: v, Product: p}
			}
		}

		o, lines, err := build(priced)
		if err != nil {
			return err
		}
		// El ID se fija antes para que el movimiento de inventario quede ligado a la orden.
		if o.ID == uuid.Nil {
			o.ID = uuid.New()
		}
		if err := inventory.Reserve(tx, lines, inventory.Meta{
			OrderID: &o.ID, ActorID: o.UserID, Reason: "Reserva por orden nueva (30 min para pagar)",
		}); err != nil {
			return err
		}
		return tx.Create(o).Error // código por secuencia; ítems e historial viajan con la orden
	})
}

func orderedItems(db *gorm.DB) *gorm.DB   { return db.Order("created_at ASC, id ASC") }
func orderedHistory(db *gorm.DB) *gorm.DB { return db.Order("created_at ASC, id ASC") }

func (r *gormRepository) Get(ctx context.Context, id uuid.UUID) (*models.Order, error) {
	var o models.Order
	err := r.db.WithContext(ctx).Preload("Items", orderedItems).Preload("History", orderedHistory).
		Where("id = ?", id).First(&o).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, errNotFound
	}
	if err != nil {
		return nil, err
	}
	return &o, nil
}

func (r *gormRepository) FindByKey(ctx context.Context, userID uuid.UUID, key string) (*models.Order, error) {
	var o models.Order
	err := r.db.WithContext(ctx).Select("id").Where("user_id = ? AND idempotency_key = ?", userID, key).First(&o).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, errNotFound
	}
	return &o, err
}

func (r *gormRepository) ListByUser(ctx context.Context, userID uuid.UUID, status string, offset, limit int) ([]models.Order, int64, error) {
	build := func() *gorm.DB {
		q := r.db.WithContext(ctx).Model(&models.Order{}).Where("user_id = ?", userID)
		if status != "" {
			q = q.Where("status = ?", status)
		}
		return q
	}
	var total int64
	if err := build().Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if total == 0 || offset >= int(total) {
		return []models.Order{}, total, nil
	}
	var items []models.Order
	err := build().Preload("Items", orderedItems).Preload("History", orderedHistory).
		Order("created_at DESC, id").Offset(offset).Limit(limit).Find(&items).Error
	return items, total, err
}

func (r *gormRepository) ExpireStale(ctx context.Context, now time.Time) (int, error) {
	var ids []uuid.UUID
	if err := r.db.WithContext(ctx).Model(&models.Order{}).
		Where("status = ? AND reserved_until IS NOT NULL AND reserved_until < ?", models.OrderPendingPayment, now).
		Order("reserved_until ASC").Limit(200).Pluck("id", &ids).Error; err != nil {
		return 0, err
	}
	expired := 0
	for _, id := range ids {
		ok, err := r.expireOne(ctx, id, now)
		if err != nil {
			return expired, err
		}
		if ok {
			expired++
		}
	}
	return expired, nil
}

// expireOne cancela una orden y libera su reserva. Vuelve a verificar bajo bloqueo: si en el
// ínterin llegó el pago (la orden ya no está pendiente), no se toca.
func (r *gormRepository) expireOne(ctx context.Context, id uuid.UUID, now time.Time) (bool, error) {
	done := false
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var o models.Order
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", id).First(&o).Error; err != nil {
			return err
		}
		if o.Status != models.OrderPendingPayment || o.ReservedUntil == nil || !o.ReservedUntil.Before(now) {
			return nil
		}
		var items []models.OrderItem
		if err := tx.Where("order_id = ?", id).Find(&items).Error; err != nil {
			return err
		}
		lines := make([]inventory.Line, 0, len(items))
		for _, it := range items {
			lines = append(lines, inventory.Line{VariantID: it.VariantID, Quantity: it.Quantity})
		}
		if err := inventory.Release(tx, lines, inventory.Meta{
			OrderID: &id, Reason: "Reserva vencida: la orden no se pagó a tiempo",
		}); err != nil {
			return err
		}
		o.Status, o.ReservedUntil, o.UpdatedAt = models.OrderCancelled, nil, now.UTC()
		if err := tx.Select("status", "reserved_until", "updated_at").Where("id = ?", id).Updates(&o).Error; err != nil {
			return err
		}
		done = true
		return tx.Create(&models.OrderStatusHistory{
			OrderID: id, Status: models.OrderCancelled,
			Note: "Cancelamos tu orden porque no recibimos el pago a tiempo. Liberamos el stock reservado.",
		}).Error
	})
	return done, err
}

type gormUsers struct{ db *gorm.DB }

// NewUserReader lee los datos del comprador.
func NewUserReader(db *gorm.DB) UserReader { return &gormUsers{db: db} }

func (r *gormUsers) FindUser(ctx context.Context, id uuid.UUID) (*models.User, error) {
	var u models.User
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&u).Error; err != nil {
		return nil, err
	}
	return &u, nil
}
