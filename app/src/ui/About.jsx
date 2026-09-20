import Logo from "./Logo.jsx";
import { U, CircleX, ArrowRight } from "./Hand.jsx";

// One short page, said plainly: what it is, what it is made of, and a way in.
export default function About({ onClose, onHome, onChat }) {
  return (
    <div className="about" role="dialog" aria-modal="true" aria-label="about efish other">
      <header className="about-bar">
        <Logo size="sm" tone="dark" onClick={onHome} />
        <button type="button" className="xhand" onClick={onClose} aria-label="close"><CircleX /></button>
      </header>
      <main className="about-body">
        <section className="about-say">
          <h2><U v={1}>ABOUT</U></h2>
          <p>efish other is a person, a memory, an efish and a dialog box.</p>
          <p className="about-sum">
            our small transformer<br />
            + deepseek<br />
            + an efish&rsquo;s knowledge base<br />
            + tuned by hand.
          </p>
          <p className="zh">它是人，是记忆，是鳄鱼，是对话框。</p>
        </section>
        <button type="button" className="about-go" onClick={onChat} aria-label="go to chat">
          <U v={2} className="about-tag"><span className="t-chat">chat</span></U>
          <ArrowRight size={22} />
        </button>
      </main>
      <footer className="about-foot">
        <span>memory stays on this device for 30 days.</span>
        <span>set in OPPO Sans.</span>
        <span>© Dai Pan / 潘岱</span>
      </footer>
    </div>
  );
}
