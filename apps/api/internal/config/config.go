// Package config carga y valida la configuración desde variables de entorno.
package config

import (
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

// Config agrupa la configuración de la API.
type Config struct {
	AppEnv   string
	HTTPPort string
	// TrustedProxies son las IP/CIDR de los proxies de los que se acepta X-Forwarded-For (Next, Caddy).
	// Solo si la conexión directa viene de uno de ellos se usa la IP del encabezado.
	TrustedProxies []string
	DB             DB
	JWT            JWT
	Payments       Payments
	// UploadDir es la carpeta donde se guardan las fotos subidas desde el panel (ADR-006: luego Cloudinary).
	UploadDir string
	Seed      Seed
}

// Payments agrupa lo necesario para las pasarelas de pago.
type Payments struct {
	WebhookSecret string // firma HMAC de los webhooks (pasarela simulada)
	WebBaseURL    string // base del frontend, para armar las URL de checkout
}

// IsProduction indica si se corre en producción (cookies Secure, modo release).
func (c Config) IsProduction() bool { return c.AppEnv == "production" }

// JWT son los secretos y vigencias de los tokens (SSD §6: access 15 min + refresh en cookie).
type JWT struct {
	AccessSecret  string
	RefreshSecret string
	AccessTTL     time.Duration
	RefreshTTL    time.Duration
}

// DB son los parámetros de conexión a PostgreSQL.
type DB struct {
	Host        string
	Port        string
	User        string
	Password    string
	Name        string
	SSLMode     string
	Timezone    string
	AutoMigrate bool
	LogSQL      bool
}

// Seed son los datos del administrador inicial.
type Seed struct {
	AdminEmail    string
	AdminPassword string
	AdminName     string
}

// DSN devuelve la cadena de conexión en formato URL (escapa caracteres especiales).
func (d DB) DSN() string {
	u := url.URL{
		Scheme: "postgres",
		User:   url.UserPassword(d.User, d.Password),
		Host:   d.Host + ":" + d.Port,
		Path:   d.Name,
		// "/" es válido en una query; pgx no decodifica "%2F" en TimeZone (America/Bogota).
		RawQuery: "sslmode=" + url.QueryEscape(d.SSLMode) + "&TimeZone=" + strings.ReplaceAll(url.QueryEscape(d.Timezone), "%2F", "/"),
	}
	return u.String()
}

// Load lee .env (solo si existe; en producción no hace falta) y valida lo obligatorio.
func Load() (*Config, error) {
	if err := godotenv.Load(); err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, fmt.Errorf("leer .env: %w", err)
	}

	autoMigrate, err := boolEnv("DB_AUTO_MIGRATE", false)
	if err != nil {
		return nil, err
	}
	logSQL, err := boolEnv("DB_LOG_SQL", false)
	if err != nil {
		return nil, err
	}

	accessTTL, err := durationEnv("JWT_ACCESS_TTL", 15*time.Minute)
	if err != nil {
		return nil, err
	}
	refreshTTL, err := durationEnv("JWT_REFRESH_TTL", 7*24*time.Hour)
	if err != nil {
		return nil, err
	}

	cfg := &Config{
		AppEnv:         env("APP_ENV", "development"),
		HTTPPort:       env("HTTP_PORT", "8080"),
		TrustedProxies: splitCSV(env("TRUSTED_PROXIES", "127.0.0.1/32,::1/128")),
		DB: DB{
			Host:        env("DB_HOST", "localhost"),
			Port:        env("DB_PORT", "5432"),
			User:        os.Getenv("DB_USER"),
			Password:    os.Getenv("DB_PASSWORD"),
			Name:        os.Getenv("DB_NAME"),
			SSLMode:     env("DB_SSLMODE", "disable"),
			Timezone:    env("DB_TIMEZONE", "America/Bogota"),
			AutoMigrate: autoMigrate,
			LogSQL:      logSQL,
		},
		JWT: JWT{
			AccessSecret:  os.Getenv("JWT_ACCESS_SECRET"),
			RefreshSecret: os.Getenv("JWT_REFRESH_SECRET"),
			AccessTTL:     accessTTL,
			RefreshTTL:    refreshTTL,
		},
		UploadDir: env("UPLOAD_DIR", "./uploads"),
		Payments: Payments{
			WebhookSecret: os.Getenv("PAYMENT_WEBHOOK_SECRET"),
			WebBaseURL:    strings.TrimRight(env("WEB_BASE_URL", "http://localhost:3000"), "/"),
		},
		Seed: Seed{
			AdminEmail:    os.Getenv("SEED_ADMIN_EMAIL"),
			AdminPassword: os.Getenv("SEED_ADMIN_PASSWORD"),
			AdminName:     env("SEED_ADMIN_NAME", "Administrador Starboy"),
		},
	}

	var missing []string
	for k, v := range map[string]string{"DB_USER": cfg.DB.User, "DB_PASSWORD": cfg.DB.Password, "DB_NAME": cfg.DB.Name} {
		if v == "" {
			missing = append(missing, k)
		}
	}
	if len(missing) > 0 {
		return nil, fmt.Errorf("faltan variables de entorno: %v", missing)
	}
	if err := cfg.validateJWT(); err != nil {
		return nil, err
	}
	if err := cfg.validateProxies(); err != nil {
		return nil, err
	}
	return cfg, nil
}

const minSecretLen = 32

func (c *Config) validateJWT() error {
	a, r := c.JWT.AccessSecret, c.JWT.RefreshSecret
	if len(a) < minSecretLen || len(r) < minSecretLen {
		return fmt.Errorf("JWT_ACCESS_SECRET y JWT_REFRESH_SECRET son obligatorios y deben tener al menos %d caracteres", minSecretLen)
	}
	if a == r {
		return errors.New("JWT_ACCESS_SECRET y JWT_REFRESH_SECRET deben ser distintos")
	}
	if len(c.Payments.WebhookSecret) < minSecretLen {
		return fmt.Errorf("PAYMENT_WEBHOOK_SECRET es obligatorio y debe tener al menos %d caracteres", minSecretLen)
	}
	if c.IsProduction() && strings.HasPrefix(c.Payments.WebhookSecret, "cambia-esto") {
		return errors.New("el secreto de webhook de ejemplo no se puede usar en producción")
	}
	if c.IsProduction() && (strings.HasPrefix(a, "cambia-esto") || strings.HasPrefix(r, "cambia-esto")) {
		return errors.New("los secretos JWT de ejemplo no se pueden usar en producción")
	}
	return nil
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func boolEnv(key string, def bool) (bool, error) {
	v := os.Getenv(key)
	if v == "" {
		return def, nil
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return false, fmt.Errorf("%s inválida (%q): %w", key, v, err)
	}
	return b, nil
}

func durationEnv(key string, def time.Duration) (time.Duration, error) {
	v := os.Getenv(key)
	if v == "" {
		return def, nil
	}
	d, err := time.ParseDuration(v)
	if err != nil || d <= 0 {
		return 0, fmt.Errorf("%s inválida (%q): usa un formato como 15m o 168h", key, v)
	}
	return d, nil
}

func splitCSV(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

// validateProxies exige IP o CIDR válidos y rechaza "confiar en todos" (0.0.0.0/0): con eso cualquiera
// podría falsear X-Forwarded-For y saltarse el rate limit.
func (c *Config) validateProxies() error {
	for _, p := range c.TrustedProxies {
		if ip := net.ParseIP(p); ip != nil {
			continue
		}
		_, n, err := net.ParseCIDR(p)
		if err != nil {
			return fmt.Errorf("TRUSTED_PROXIES: %q no es una IP ni un CIDR válido", p)
		}
		if ones, _ := n.Mask.Size(); ones == 0 {
			return fmt.Errorf("TRUSTED_PROXIES: %q confía en todo Internet; lista solo las IP de tus proxies", p)
		}
	}
	return nil
}
