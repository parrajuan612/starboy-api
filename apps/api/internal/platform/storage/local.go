// Package storage guarda las fotos que sube el panel. Hoy: disco local (desarrollo y VM propia).
// El contrato (Save/Delete, public_id + url) es el mismo que usará un driver de Cloudinary (ADR-006).
package storage

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"

	"github.com/google/uuid"
)

// URLPrefix es la ruta pública desde la que se sirven las fotos locales (la web la reenvía a la API).
const URLPrefix = "/uploads/"

// MaxBytes es el tamaño máximo de una foto (5 MB).
const MaxBytes = 5 << 20

// ErrUnsupported: el archivo no es JPEG, PNG ni WebP (se mira el contenido, no la extensión).
var ErrUnsupported = errors.New("tipo de archivo no permitido")

var publicIDRe = regexp.MustCompile(`^local/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$`)

var extByType = map[string]string{"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}

// Stored es el resultado de guardar una foto.
type Stored struct {
	PublicID string `json:"public_id"`
	URL      string `json:"url"`
}

// Local guarda archivos en un directorio.
type Local struct{ dir string }

// NewLocal crea (si hace falta) el directorio.
func NewLocal(dir string) (*Local, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("crear directorio de fotos: %w", err)
	}
	return &Local{dir: dir}, nil
}

// Dir devuelve el directorio de fotos.
func (l *Local) Dir() string { return l.dir }

// Save valida el contenido (JPEG, PNG o WebP; hasta MaxBytes) y lo guarda con un nombre aleatorio:
// el nombre original nunca se usa, así no hay colisiones ni rutas manipuladas.
func (l *Local) Save(r io.Reader) (*Stored, error) {
	data, err := io.ReadAll(io.LimitReader(r, MaxBytes+1))
	if err != nil {
		return nil, err
	}
	if len(data) > MaxBytes {
		return nil, ErrTooLarge
	}
	ext, ok := extByType[http.DetectContentType(data)]
	if !ok {
		return nil, ErrUnsupported
	}
	name := uuid.NewString() + "." + ext
	if err := os.WriteFile(filepath.Join(l.dir, name), data, 0o644); err != nil {
		return nil, err
	}
	return &Stored{PublicID: "local/" + name, URL: URLPrefix + name}, nil
}

// ErrTooLarge: la foto supera MaxBytes.
var ErrTooLarge = errors.New("archivo demasiado grande")

// Delete borra la foto de un public_id local. Ignora ids de otros orígenes (p. ej. Cloudinary) y archivos que ya no están.
func (l *Local) Delete(publicID string) error {
	if !publicIDRe.MatchString(publicID) {
		return nil
	}
	err := os.Remove(filepath.Join(l.dir, publicID[len("local/"):]))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

// IsLocalURL indica si la URL apunta a una foto local válida y, de ser así, devuelve su public_id esperado.
func IsLocalURL(u string) (publicID string, ok bool) {
	if len(u) <= len(URLPrefix) || u[:len(URLPrefix)] != URLPrefix {
		return "", false
	}
	id := "local/" + u[len(URLPrefix):]
	return id, publicIDRe.MatchString(id)
}
