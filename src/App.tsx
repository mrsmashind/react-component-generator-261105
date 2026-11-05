import { useState, useEffect } from 'react';
import { PromptInput } from './components/PromptInput';
import { ComponentCard } from './components/ComponentCard';
import { useComponentGenerator } from './hooks/useComponentGenerator';
import type { Provider } from './types';
import './App.css';

const PROVIDER_CONFIG = {
  anthropic: { label: 'Anthropic', placeholder: 'sk-ant-...' },
  google: { label: 'Google', placeholder: 'AIza...' },
} as const;

function App() {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [provider, setProvider] = useState<Provider>('google');
  const [envKeys, setEnvKeys] = useState<Record<Provider, boolean>>({
    anthropic: false,
    google: false,
  });
  const { components, isLoading, error, generate, removeComponent, clearAll } =
    useComponentGenerator();

  useEffect(() => {
    fetch('/api/config')
      .then((res) => res.json())
      .then((data) => setEnvKeys(data.envKeys))
      .catch(() => {});
  }, []);

  const hasEnvKey = envKeys[provider];

  const handleGenerate = (prompt: string) => {
    if (!apiKey.trim() && !hasEnvKey) {
      alert(`${PROVIDER_CONFIG[provider].label} API 키를 입력하거나 .env에 설정해주세요.`);
      return;
    }
    generate(prompt, apiKey || undefined, provider);
  };

  const handleProviderChange = (newProvider: Provider) => {
    setProvider(newProvider);
    setApiKey('');
  };

  const activeProvider = PROVIDER_CONFIG[provider].label;

  return (
    <div className="app">
      <header className="menubar">
        <div className="menubar-brand">
          <span className="brand-mark" aria-hidden="true">RC</span>
          <span>React Component Generator</span>
        </div>
        <div className="menubar-status" aria-label="현재 작업 상태">
          <span>모델 {activeProvider}</span>
          <span>컴포넌트 {components.length}개</span>
        </div>
      </header>

      <div className="hero">
        <h1>프롬프트로 만드는 UI 워크벤치</h1>
        <p>요청을 입력하고, 생성된 React 컴포넌트를 바로 미리보고 코드로 확인합니다.</p>
      </div>

      <main className="workspace">
        <section className="window composer-panel" aria-label="컴포넌트 생성">
          <PromptInput onGenerate={handleGenerate} isLoading={isLoading} />
        </section>

        <aside className="window settings-panel" aria-label="실행 설정">
          <div className="titlebar">
            <h2>실행 설정</h2>
          </div>
          <div className="window-body">
          <div className="provider-select">
            <label htmlFor="provider">Provider</label>
            <select
              id="provider"
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value as Provider)}
            >
              {Object.entries(PROVIDER_CONFIG).map(([key, { label }]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="api-key-input">
            <label htmlFor="api-key">
              API Key
            </label>
            <div className="api-key-field">
              <input
                id="api-key"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  hasEnvKey
                    ? '서버 키 사용 중 (직접 입력으로 덮어쓰기 가능)'
                    : PROVIDER_CONFIG[provider].placeholder
                }
              />
              <button
                className="btn-toggle-key"
                onClick={() => setShowKey(!showKey)}
                type="button"
              >
                {showKey ? '숨기기' : '보기'}
              </button>
            </div>
            <p className={`key-status ${hasEnvKey ? 'key-status--ready' : ''}`}>
              {hasEnvKey ? '.env 키가 연결되어 있습니다.' : '직접 입력하거나 서버 환경변수를 설정하세요.'}
            </p>
          </div>
          </div>
        </aside>
      </main>

      {error && (
        <div className="window error-banner" role="alert">
          <div className="titlebar">
            <h2>오류</h2>
          </div>
          <p>{error}</p>
        </div>
      )}

      <section className="results-section">
        {components.length > 0 && (
          <div className="results-header">
            <h2>생성된 컴포넌트</h2>
            <button className="btn-clear" onClick={clearAll}>
              전체 삭제
            </button>
          </div>
        )}

        {components.length === 0 && !isLoading && (
          <div className="window empty-state">
            <div className="titlebar">
              <h2>생성된 컴포넌트</h2>
            </div>
            <div className="empty-body">
              <div className="empty-preview" aria-hidden="true">
                <div className="empty-window">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="empty-canvas">
                  <div className="empty-card empty-card--primary" />
                  <div className="empty-card" />
                  <div className="empty-card empty-card--wide" />
                </div>
              </div>
              <div className="empty-copy">
                <p className="empty-title">아직 만든 컴포넌트가 없습니다.</p>
                <p>
                  만들고 싶은 UI를 위 입력창에 적고 <kbd>Ctrl</kbd> + <kbd>Enter</kbd>를
                  누르세요. 결과는 이 창에 쌓입니다.
                </p>
              </div>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="window loading-card" role="status">
            <div className="titlebar">
              <h2>생성 중</h2>
            </div>
            <div className="loading-body">
              <p>컴포넌트를 생성하고 있습니다...</p>
              <div className="progress" aria-hidden="true" />
            </div>
          </div>
        )}

        <div className="results-grid">
          {components.map((component) => (
            <ComponentCard
              key={component.id}
              component={component}
              onRemove={removeComponent}
              onRegenerate={handleGenerate}
              isLoading={isLoading}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

export default App;
