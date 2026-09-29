import { unlink } from 'node:fs/promises';
import path from 'node:path';

/** Dossier d'upload résolu depuis le cwd (photos locales legacy ; l'upload se fait sur Cloudinary). */
export const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');

/** Extrait le nom de fichier d'une URL photo servie par l'API (`/uploads/x.jpg`). */
export function filenameFromUrl(url: string): string | null {
  const match = /^\/uploads\/([A-Za-z0-9._-]+)$/.exec(url);
  return match ? match[1] : null;
}

/** Supprime une photo locale du disque (ignore silencieusement si absente). */
export async function deletePhotoFile(filename: string): Promise<void> {
  try {
    // basename() empêche toute traversée de répertoire.
    await unlink(path.join(UPLOAD_DIR, path.basename(filename)));
  } catch {
    // Fichier déjà absent : rien à faire.
  }
}
