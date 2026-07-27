const LOGO_PATH = '/assets/logo-shekinah.png';

export function App() {
  return (
    <main className="app-shell" id="main-content">
      <img
        className="brand-logo"
        src={LOGO_PATH}
        width="383"
        height="383"
        alt="Shekinah, hierbas y especias"
      />
      <div className="brand-copy">
        <h1>Shekinah</h1>
        <p>Hierbas y especias</p>
      </div>
    </main>
  );
}
