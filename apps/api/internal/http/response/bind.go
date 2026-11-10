package response

import (
	"errors"
	"fmt"
	"net/http"
	"reflect"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/binding"
	"github.com/go-playground/validator/v10"

	"github.com/juancamiloparra/starboy-api/internal/apperr"
)

const maxBodyBytes = 1 << 20 // 1 MiB

func init() {
	// Los errores de validación usan el nombre del campo en JSON/query, no el del struct.
	if v, ok := binding.Validator.Engine().(*validator.Validate); ok {
		v.RegisterTagNameFunc(func(f reflect.StructField) string {
			for _, tag := range []string{"json", "form"} {
				if name := strings.Split(f.Tag.Get(tag), ",")[0]; name != "" && name != "-" {
					return name
				}
			}
			return f.Name
		})
	}
}

// BindJSON lee y valida el cuerpo. Si falla, responde el error y devuelve false.
func BindJSON(c *gin.Context, dst any) bool {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBodyBytes)
	if err := c.ShouldBindJSON(dst); err != nil {
		Fail(c, bindError(err))
		return false
	}
	return true
}

// BindQuery lee y valida los parámetros de la URL. Si falla, responde el error y devuelve false.
func BindQuery(c *gin.Context, dst any) bool {
	if err := c.ShouldBindQuery(dst); err != nil {
		Fail(c, bindError(err))
		return false
	}
	return true
}

func bindError(err error) *apperr.Error {
	var verrs validator.ValidationErrors
	if errors.As(err, &verrs) {
		fields := make(map[string]string, len(verrs))
		for _, fe := range verrs {
			fields[fieldPath(fe)] = fieldMessage(fe)
		}
		return apperr.New(apperr.KindValidation, "VALIDATION_ERROR",
			"Revisa los datos que enviaste.").WithDetails(fields)
	}
	return apperr.New(apperr.KindBadRequest, "INVALID_REQUEST",
		"No pudimos leer tu solicitud. Revisa el formato e inténtalo de nuevo.")
}

// fieldPath devuelve la ruta del campo sin el nombre del struct raíz: "items[0].quantity".
func fieldPath(fe validator.FieldError) string {
	if _, path, ok := strings.Cut(fe.Namespace(), "."); ok {
		return path
	}
	return fe.Field()
}

func fieldMessage(fe validator.FieldError) string {
	isText := fe.Kind() == reflect.String
	switch fe.Tag() {
	case "required":
		return "Este campo es obligatorio."
	case "email":
		return "Escribe un correo válido."
	case "min":
		if isText {
			return fmt.Sprintf("Debe tener al menos %s caracteres.", fe.Param())
		}
		return fmt.Sprintf("Debe ser como mínimo %s.", fe.Param())
	case "max":
		if isText {
			return fmt.Sprintf("Debe tener máximo %s caracteres.", fe.Param())
		}
		return fmt.Sprintf("Debe ser como máximo %s.", fe.Param())
	case "gte":
		return fmt.Sprintf("Debe ser mayor o igual a %s.", fe.Param())
	case "lte":
		return fmt.Sprintf("Debe ser menor o igual a %s.", fe.Param())
	case "oneof":
		return "Valor no permitido. Opciones: " + strings.ReplaceAll(fe.Param(), " ", ", ") + "."
	default:
		return "Valor no válido."
	}
}
