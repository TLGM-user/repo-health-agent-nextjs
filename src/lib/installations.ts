export type InstallationStatus = "active" | "disabled" | "pending";

export type InstallationRecord = {
  installationId: number;
  owner: string;
  repo?: string;
  accountType: "User" | "Organization";
  status: InstallationStatus;
  createdAt: string;
  updatedAt: string;
};

class InstallationStore {
  private installations = new Map<number, InstallationRecord>();

  upsert(record: Omit<InstallationRecord, "createdAt" | "updatedAt"> & { createdAt?: string; updatedAt?: string }) {
    const now = new Date().toISOString();
    const existing = this.installations.get(record.installationId);

    const next: InstallationRecord = {
      ...record,
      createdAt: existing?.createdAt ?? record.createdAt ?? now,
      updatedAt: record.updatedAt ?? now,
    };

    this.installations.set(record.installationId, next);
    return next;
  }

  list() {
    return Array.from(this.installations.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  get(installationId: number) {
    return this.installations.get(installationId);
  }
}

export const installationStore = new InstallationStore();
