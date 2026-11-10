// Command server arranca la API de Starboy.
package main

import (
	"context"
	"errors"
	"log"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/juancamiloparra/starboy-api/internal/config"
	apihttp "github.com/juancamiloparra/starboy-api/internal/http"
	"github.com/juancamiloparra/starboy-api/internal/jobs"
	"github.com/juancamiloparra/starboy-api/internal/platform/database"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}
	db, err := database.Connect(cfg.DB)
	if err != nil {
		log.Fatalf("base de datos: %v", err)
	}
	if cfg.DB.AutoMigrate {
		if err := database.Migrate(db); err != nil {
			log.Fatalf("migración: %v", err)
		}
	}

	router, svcs := apihttp.NewRouter(cfg, db)
	srv := &http.Server{
		Addr:              ":" + cfg.HTTPPort,
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	// Tareas periódicas: liberan el stock de las órdenes sin pago (SSD §10.1: cada 5 min).
	jobCtx, stopJobs := context.WithCancel(context.Background())
	defer stopJobs()
	go jobs.Every(jobCtx, "expirar-ordenes", 5*time.Minute, func(ctx context.Context) error {
		_, err := svcs.Orders.ExpireStale(ctx)
		return err
	})

	go func() {
		slog.Info("API escuchando", "addr", srv.Addr, "env", cfg.AppEnv)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("servidor: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	stopJobs()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("apagado: %v", err)
	}
}
