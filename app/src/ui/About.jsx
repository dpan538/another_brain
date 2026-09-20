import Logo from "./Logo.jsx";
import { U, CircleX, ArrowRight } from "./Hand.jsx";

// One short page. Draft copy: the owner is expected to rewrite it.
export default function About({ onClose, onHome, onChat }) {
  return (
    <div className="about" role="dialog" aria-modal="true" aria-label="about efish other">
      <header className="about-bar">
        <Logo size="sm" tone="dark" onClick={onHome} />
        <button type="button" className="xhand" onClick={onClose} aria-label="close"><CircleX /></button>
      </header>
      <main className="about-body">
        <section>
          <h2><U v={1}>ABOUT</U></h2>
          <p>efish other is a person, a memory, a crocodile and a dialog box, all at once. Two models sit behind it: a small transformer of our own, trained from nothing on one laptop and still learning to speak, and DeepSeek, which lends it language in the meantime. What it says belongs to neither.</p>
        </section>
        <section>
          <p className="zh">它是人，是记忆，是鳄鱼，是对话框，同时是。背后有两个模型：一个是我们自己从零训练的小 transformer，还在学说话；一个是 DeepSeek，先把语言借给它。它说的话不属于其中任何一个。</p>
        </section>
        <button type="button" className="about-go" onClick={onChat} aria-label="go to chat">
          <U v={2} className="about-tag"><span className="t-chat">chat</span></U>
          <ArrowRight size={22} />
        </button>
        <footer className="about-foot">
          <span>memory stays on this device for 30 days.</span>
          <span>set in OPPO Sans.</span>
          <span>© Dai Pan / 潘岱</span>
        </footer>
      </main>
    </div>
  );
}
