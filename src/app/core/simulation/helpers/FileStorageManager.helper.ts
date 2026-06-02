import { FileObject } from "app/core/types/variables.types";

export class FileStorageManager {
  private root!: FileSystemDirectoryHandle;
  private files: Map<string, FileSystemFileHandle> = new Map();
  private writers: Map<string, FileSystemSyncAccessHandle> = new Map();

  async init(files: FileObject[]) {
    this.root = await navigator.storage.getDirectory();
    for (const file of files) {
      const handle = await this.root.getFileHandle(file.name, { create: true });
      this.files.set(file.name, handle);
      this.writers.set(file.name, await handle.createSyncAccessHandle());
      this.truncateFile(this.writers.get(file.name)!);

      this.write(file.name, null, file.header, false, true);
    }
  }

  write(fileName: string, iniTimestamp: any, message: string, printTimestamp: boolean, ignoreSize: boolean = false) {
    const writer = this.writers.get(fileName);
    if (!writer) return;

    const timestamp = Date.now() - iniTimestamp;
    const finalMessage = printTimestamp ? `${timestamp};${message}\n` : `${message}\n`;
    const encoder = new TextEncoder();
    const buffer = encoder.encode(finalMessage);

    // IMPORTANTE: Obtenemos el tamaño actual y escribimos justo ahí (al final)
    const currentSize = ignoreSize ? 0 : writer.getSize();
    writer.write(buffer, { at: currentSize });

    writer.flush();
  }

  async prepareForDownload(fileName: string): Promise<FileSystemFileHandle> {
    const writer = this.writers.get(fileName);
    const fileHandle = this.files.get(fileName);

    if (writer && fileHandle) {
      writer.flush();
      writer.close(); // Liberamos para que el servicio pueda leer

      // Reabrimos el handle. El próximo write() usará getSize() y escribirá al final.
      const newWriter = await fileHandle.createSyncAccessHandle();
      this.writers.set(fileName, newWriter);

      return fileHandle;
    }
    throw new Error(`File ${fileName} not found`);
  }

  truncateFile(writer: FileSystemSyncAccessHandle) {
    writer.truncate(0)
  }

  truncateAll() {
    this.writers.forEach(w => this.truncateFile(w));
  }

  closeAll() {
    this.writers.forEach(w => {
      w.flush();
      w.close();
    });
  }
}