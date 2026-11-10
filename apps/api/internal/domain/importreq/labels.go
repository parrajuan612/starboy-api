package importreq

import "github.com/juancamiloparra/starboy-api/internal/models"

// statusLabels es el texto visible para el cliente (SSD §10.3, voz de marca §12.1).
var statusLabels = map[models.ImportStatus]string{
	models.ImportRequested:      "Solicitada",
	models.ImportQuoted:         "Cotizada",
	models.ImportAccepted:       "Aceptada",
	models.ImportPaid:           "Anticipo pagado",
	models.ImportPurchased:      "Comprada en USA",
	models.ImportInUSWarehouse:  "En bodega USA",
	models.ImportInTransit:      "En tránsito",
	models.ImportInCustoms:      "En aduana",
	models.ImportInCOWarehouse:  "En bodega Colombia",
	models.ImportBalanceDue:     "Saldo pendiente",
	models.ImportOutForDelivery: "En reparto",
	models.ImportDelivered:      "Entregada",
	models.ImportRejected:       "Rechazada",
	models.ImportExpired:        "Vencida",
	models.ImportCancelled:      "Cancelada",
}

func statusLabel(s models.ImportStatus) string {
	if l, ok := statusLabels[s]; ok {
		return l
	}
	return string(s)
}
