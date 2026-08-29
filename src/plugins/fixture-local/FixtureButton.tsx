//! Fixture plugin's `renderToolbarButton` contribution. Local-only: no
//! network, no schedule — a visible marker that the host rendered an enabled
//! plugin contribution into the library toolbar slot.

export default function FixtureButton() {
  return (
    <button
      type="button"
      className="litera-btn text-xs"
      title="fixture-local: enabled plugin contribution"
      onClick={() => undefined}
    >
      Fixture
    </button>
  );
}
