/** The shell can release module-owned media before the next module mounts. */
const releases = new Set<() => void>();
export function registerResourceRelease(release: () => void) {
  releases.add(release);
  return () => {
    release();
    releases.delete(release);
  };
}
export function releaseTrainingResources() {
  for (const release of releases) release();
  releases.clear();
}
