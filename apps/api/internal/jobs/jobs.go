// Package jobs agrupa las tareas periódicas en segundo plano (SSD §10.1).
package jobs

import (
	"context"
	"log/slog"
	"time"
)

// Every ejecuta fn al arrancar y luego cada `interval`, hasta que ctx se cancele.
// Un fallo se registra y no detiene el ciclo: se reintenta en la siguiente vuelta.
func Every(ctx context.Context, name string, interval time.Duration, fn func(context.Context) error) {
	run := func() {
		if err := fn(ctx); err != nil && ctx.Err() == nil {
			slog.Error("job falló", "job", name, "error", err)
		}
	}
	run()
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			run()
		}
	}
}
