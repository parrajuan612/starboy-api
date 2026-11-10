// Package apperr define los errores de negocio que los servicios devuelven a los handlers.
// No conoce HTTP: la capa http/response traduce el Kind a un código de estado.
package apperr

import "errors"

// Kind clasifica el error.
type Kind int

const (
	KindBadRequest Kind = iota + 1
	KindValidation
	KindUnauthorized
	KindForbidden
	KindNotFound
	KindConflict
	KindTooManyRequests
	KindInternal
)

// Error es un error de aplicación con código estable y mensaje apto para el cliente.
type Error struct {
	Kind    Kind
	Code    string // estable, en MAYÚSCULAS: EMAIL_TAKEN
	Message string // en español, voz de marca (SSD §12.1)
	Details any
	Err     error // causa interna, nunca se envía al cliente
}

func (e *Error) Error() string {
	if e.Err != nil {
		return e.Code + ": " + e.Err.Error()
	}
	return e.Code + ": " + e.Message
}

func (e *Error) Unwrap() error { return e.Err }

// New crea un error de aplicación.
func New(kind Kind, code, message string) *Error {
	return &Error{Kind: kind, Code: code, Message: message}
}

// WithDetails devuelve una copia con detalles (por ejemplo, errores por campo).
func (e *Error) WithDetails(d any) *Error {
	c := *e
	c.Details = d
	return &c
}

// Internal envuelve un fallo inesperado; el cliente solo ve un mensaje genérico.
func Internal(err error) *Error {
	return &Error{
		Kind:    KindInternal,
		Code:    "INTERNAL_ERROR",
		Message: "Algo salió mal de nuestro lado. Inténtalo de nuevo en unos minutos.",
		Err:     err,
	}
}

// As extrae un *Error de la cadena de errores.
func As(err error) (*Error, bool) {
	var e *Error
	if errors.As(err, &e) {
		return e, true
	}
	return nil, false
}
