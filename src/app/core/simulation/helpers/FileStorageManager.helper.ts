export class FileStorageManager {
  private root!: FileSystemDirectoryHandle;
  private files: Map<string, FileSystemFileHandle> = new Map();
  private writers: Map<string, FileSystemSyncAccessHandle> = new Map();

  async init(fileNames: string[]) {
    this.root = await navigator.storage.getDirectory();
    for (const name of fileNames) {
      const handle = await this.root.getFileHandle(name, { create: true });
      this.files.set(name, handle);
      this.writers.set(name, await handle.createSyncAccessHandle());
    }
  }

  write(fileName: string, iniTimestamp: any, message: string, printTimestamp: boolean) {
    const writer = this.writers.get(fileName);
    if (!writer) return;
    console.log('----------- ESCRIBIENDO MENSAJES -----------')

    const timestamp = Date.now() - iniTimestamp;

    // Si printTimestamp es true, imprimimos el tiempo.
    const finalMessage = printTimestamp
        ? `${timestamp};${message}\n`
        : `${message}\n`;

        
    const encoder = new TextEncoder();
    writer.write(encoder.encode(finalMessage));
    writer.flush();
  }

  async prepareForDownload(fileName: string): Promise<FileSystemFileHandle> {
    const writer = this.writers.get(fileName);
    const fileHandle = this.files.get(fileName);

    if (writer && fileHandle) {
      writer.flush();
      writer.close(); // Liberamos el bloqueo

      // Reabrimos inmediatamente para no perder datos de la simulación
      this.writers.set(fileName, await fileHandle.createSyncAccessHandle());
      return fileHandle;
    }
    throw new Error(`File ${fileName} not found`);
  }

  truncateAll() {
    this.writers.forEach(w => w.truncate(0));
  }

  closeAll() {
    this.writers.forEach(w => {
      w.flush();
      w.close();
    });
  }
}