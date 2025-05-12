import { TabsProps } from '../types';

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
    <div className="tabs-container">
      <ul className="tabs-list">
        {tabs.map((tab) => (
          <li key={tab.id} className="tab-item">
            <button
              onClick={() => onTabChange(tab.id)}
              className={activeTabId === tab.id ? 'active' : ''}
              role="tab"
              aria-selected={activeTabId === tab.id}
              aria-controls={`tab-content-${tab.id}`}
            >
              {tab.label}
            </button>
          </li>
        ))}
      </ul>
      <div className="tab-content-area">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            id={`tab-content-${tab.id}`}
            className={`tab-content ${activeTabId === tab.id ? 'active' : ''}`}
            style={{ display: activeTabId === tab.id ? 'block' : 'none' }}
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
