// Command migrate aplica el esquema de la BD (preMigrate -> AutoMigrate -> postMigrate).
// Con -seed carga además los datos iniciales (idempotente).
package main

import (
	"flag"
	"log"

	"github.com/juancamiloparra/starboy-api/internal/config"
	"github.com/juancamiloparra/starboy-api/internal/platform/database"
	"github.com/juancamiloparra/starboy-api/internal/seed"
)

func main() {
	withSeed := flag.Bool("seed", false, "cargar datos iniciales después de migrar")
	withDemo := flag.Bool("seed-demo", false, "cargar productos de demostración (solo desarrollo; requiere -seed previo)")
	flag.Parse()

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}
	db, err := database.Connect(cfg.DB)
	if err != nil {
		log.Fatalf("base de datos: %v", err)
	}
	if err := database.Migrate(db); err != nil {
		log.Fatalf("migración: %v", err)
	}
	log.Println("migración completada")

	if *withSeed {
		if err := seed.Run(db, cfg.Seed); err != nil {
			log.Fatalf("seed: %v", err)
		}
		log.Println("seed completado")
	}
	if *withDemo {
		if err := seed.RunDemo(db, cfg.IsProduction()); err != nil {
			log.Fatalf("seed-demo: %v", err)
		}
		log.Println("seed-demo completado")
	}
}
