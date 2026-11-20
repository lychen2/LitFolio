export function activateUpdates() {
  return { pluginId: "updates", deactivate: () => undefined };
}
