import { TabsProps } from '../types';
import styles from './Tabs.module.css'; // Import CSS Module

// Define props including the controlled state
interface ControlledTabsProps extends TabsProps {
  // Extend existing TabsProps for the 'tabs' array type
  activeTabId: string;
  onTabChange: (tabId: string) => void;
}

export function Tabs({ tabs, activeTabId, onTabChange }: ControlledTabsProps) {
  // Internal state is removed
  // const [activeTabId, setActiveTabId] = useState<string>(tabs[0]?.id || '');

  return (
    <div className={styles.tabsContainer}>
      <ul className={styles.tabsList}>
        {tabs.map((tab) => (
          <li key={tab.id} className={styles.tabItem}>
            <button
              onClick={() => onTabChange(tab.id)}
              className={`${styles.button} ${activeTabId === tab.id ? styles.active : ''}`}
              role="tab"
              aria-selected={activeTabId === tab.id}
              aria-controls={`tab-content-${tab.id}`}
            >
              {tab.label}
            </button>
          </li>
        ))}
      </ul>
      <div className={styles.tabContentArea}>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            id={`tab-content-${tab.id}`}
            className={`${styles.tabContent} ${activeTabId === tab.id ? styles.active : ''}`}
            role="tabpanel"
            aria-labelledby={`tab-${tab.id}`}
          >
            {activeTabId === tab.id ? tab.content : null}
          </div>
        ))}
      </div>
    </div>
  );
}
