
import { Importer } from './types';
import { totalGestImporter } from './adapters/totalGestImporter';
import { grandTotalImporter } from './adapters/grandTotalImporter';

class ImporterRegistry {
    private importers: Importer[] = [];

    register(importer: Importer) {
        // Avoid duplicates by ID
        if (!this.importers.find(i => i.id === importer.id)) {
            this.importers.push(importer);
        }
    }

    async detectImporter(file: File): Promise<Importer | null> {
        for (const importer of this.importers) {
            if (await importer.canHandle(file)) {
                return importer;
            }
        }
        return null;
    }

    getAll(): Importer[] {
        return this.importers;
    }
}

export const registry = new ImporterRegistry();

// Register default importers
registry.register(totalGestImporter);
registry.register(grandTotalImporter);
