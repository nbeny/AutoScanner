/** Minimal subset of the committed Kali dataset the factory needs. */
export interface KaliToolRecord {
  package: string;
  binary: string;
  displayName: string;
  description: string;
  categories: string[];
  kaliRelease: string;
}
