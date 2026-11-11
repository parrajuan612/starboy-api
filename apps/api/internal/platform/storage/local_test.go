package storage

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

var (
	png  = append([]byte{0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a}, bytes.Repeat([]byte{0}, 64)...)
	jpeg = append([]byte{0xFF, 0xD8, 0xFF, 0xE0}, bytes.Repeat([]byte{0}, 64)...)
)

func TestSaveAcceptsImagesByContent(t *testing.T) {
	l, err := NewLocal(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	for name, data := range map[string][]byte{"png": png, "jpeg": jpeg} {
		s, err := l.Save(bytes.NewReader(data))
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		if !strings.HasPrefix(s.URL, URLPrefix) || !publicIDRe.MatchString(s.PublicID) {
			t.Fatalf("%s: salida inesperada %+v", name, s)
		}
		if _, err := os.Stat(filepath.Join(l.Dir(), strings.TrimPrefix(s.URL, URLPrefix))); err != nil {
			t.Fatalf("%s: no quedó guardado: %v", name, err)
		}
	}
}

func TestSaveRejectsNonImagesAndHugeFiles(t *testing.T) {
	l, _ := NewLocal(t.TempDir())
	if _, err := l.Save(strings.NewReader("<script>alert(1)</script>")); !errors.Is(err, ErrUnsupported) {
		t.Fatalf("HTML debe rechazarse, got %v", err)
	}
	if _, err := l.Save(strings.NewReader("GIF89a....")); !errors.Is(err, ErrUnsupported) {
		t.Fatalf("GIF no está permitido, got %v", err)
	}
	if _, err := l.Save(bytes.NewReader(append(png, bytes.Repeat([]byte{0}, MaxBytes)...))); !errors.Is(err, ErrTooLarge) {
		t.Fatalf("más de 5 MB debe rechazarse, got %v", err)
	}
}

func TestDeleteOnlyTouchesOwnFiles(t *testing.T) {
	dir := t.TempDir()
	l, _ := NewLocal(dir)
	s, _ := l.Save(bytes.NewReader(png))
	if err := l.Delete(s.PublicID); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, strings.TrimPrefix(s.URL, URLPrefix))); !os.IsNotExist(err) {
		t.Fatal("debió borrarse")
	}
	if err := l.Delete(s.PublicID); err != nil { // ya no existe: no es error
		t.Fatal(err)
	}
	outside := filepath.Join(filepath.Dir(dir), "secreto.txt")
	_ = os.WriteFile(outside, []byte("x"), 0o644)
	defer os.Remove(outside)
	for _, bad := range []string{"local/../secreto.txt", "../secreto.txt", "res/cloudinary-id", "local/" + "x.png"} {
		if err := l.Delete(bad); err != nil {
			t.Fatalf("%q no debe fallar (se ignora): %v", bad, err)
		}
	}
	if _, err := os.Stat(outside); err != nil {
		t.Fatal("un public_id manipulado borró un archivo ajeno")
	}
}

func TestIsLocalURL(t *testing.T) {
	if _, ok := IsLocalURL("/uploads/../etc/passwd"); ok {
		t.Fatal("ruta con .. no es válida")
	}
	if id, ok := IsLocalURL("/uploads/123e4567-e89b-12d3-a456-426614174000.png"); !ok || id != "local/123e4567-e89b-12d3-a456-426614174000.png" {
		t.Fatalf("debió reconocerse: %q %v", id, ok)
	}
}
