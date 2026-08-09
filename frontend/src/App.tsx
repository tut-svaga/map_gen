import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { FeedbackProvider } from './ui/FeedbackProvider';
import { RoadmapPage } from './roadmap/RoadmapPage';
import { FreezePage } from './freeze/FreezePage';
import styles from './App.module.css';

const TABS = [
  { id: 'roadmap', label: 'Маршрут' },
  { id: 'freeze', label: 'Заморозка' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function tabFromHash(): TabId {
  const value = window.location.hash.replace(/^#\/?/, '');
  return TABS.some((tab) => tab.id === value) ? (value as TabId) : 'roadmap';
}

export default function App() {
  // Вкладка в hash, а не в состоянии: перезагрузка страницы и кнопка «назад»
  // тогда работают сами собой, и вкладку можно кинуть ссылкой.
  const [tab, setTab] = useState<TabId>(tabFromHash);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const sync = () => setTab(tabFromHash());
    // popstate — на кнопку «назад», hashchange — на ручную правку адреса
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
    };
  }, []);

  const select = (id: TabId) => {
    if (id === tab) return;
    window.history.pushState(null, '', `#/${id}`);
    setTab(id);
  };

  return (
    <FeedbackProvider>
      <div className={styles.shell}>
        <div className={styles.aurora} aria-hidden="true" />

        <header className={styles.topbar}>
          <div className={styles.topbarInner}>
            <div className={styles.brand}>
              <svg className={styles.brandMark} viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="10" fill="none" stroke="var(--line)" strokeWidth="1.5" />
                <path
                  d="M12 2a10 10 0 0 1 9.5 6.9"
                  fill="none"
                  stroke="var(--ember)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <circle cx="12" cy="12" r="3" fill="var(--ice)" />
              </svg>
              <div className={styles.brandText}>
                Трекер
                <span>маршрут и заморозка</span>
              </div>
            </div>

            <div className={styles.tabs} role="tablist" aria-label="Разделы">
              {TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  className={styles.tab}
                  aria-selected={tab === item.id}
                  onClick={() => select(item.id)}
                >
                  {tab === item.id && (
                    <motion.span
                      layoutId="tab-pill"
                      className={styles.tabPill}
                      transition={
                        reduceMotion
                          ? { duration: 0 }
                          : { type: 'spring', stiffness: 480, damping: 38 }
                      }
                    />
                  )}
                  <span className={styles.tabLabel}>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </header>

        <main className={styles.main}>
          {/* mode="wait" — уходящая страница успевает исчезнуть до появления
              следующей. Иначе две страницы на миг накладываются и прыгает высота. */}
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduceMotion ? 0 : -8 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              {tab === 'roadmap' ? <RoadmapPage /> : <FreezePage />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </FeedbackProvider>
  );
}
