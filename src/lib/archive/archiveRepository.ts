import type { ArchiveRepository } from "./archiveTypes";

let repository: ArchiveRepository | null = null;

export function configureArchiveRepository(next: ArchiveRepository): void {
  repository = next;
}

export function getArchiveRepository(): ArchiveRepository {
  if (!repository) {
    throw new Error("Archive repository has not been configured");
  }
  return repository;
}
