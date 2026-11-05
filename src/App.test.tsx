import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/config') {
        return { ok: true, json: async () => ({ envKeys: { anthropic: false, google: false } }) };
      }
      return { ok: true, json: async () => ({ code: 'const A = () => <div />;\nrender(<A />);' }) };
    }),
  );
}

describe('App 상태 영속성', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    stubFetch();
  });

  it('저장된 Provider를 복원한다', () => {
    localStorage.setItem('rcg:provider', JSON.stringify('anthropic'));
    render(<App />);
    expect(screen.getByLabelText('Provider')).toHaveValue('anthropic');
  });

  it('Provider를 바꾸면 저장된다', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(screen.getByLabelText('Provider'), 'anthropic');
    expect(JSON.parse(localStorage.getItem('rcg:provider')!)).toBe('anthropic');
  });

  it('입력한 API 키가 다시 렌더링해도 유지된다', async () => {
    const user = userEvent.setup();
    const first = render(<App />);
    await user.type(screen.getByLabelText('API Key'), 'AIza-test');
    first.unmount();

    render(<App />);
    expect(screen.getByLabelText('API Key')).toHaveValue('AIza-test');
  });

  it('API 키는 Provider별로 따로 저장되고 전환해도 지워지지 않는다', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText('API Key'), 'google-key');

    await user.selectOptions(screen.getByLabelText('Provider'), 'anthropic');
    expect(screen.getByLabelText('API Key')).toHaveValue('');

    await user.selectOptions(screen.getByLabelText('Provider'), 'google');
    expect(screen.getByLabelText('API Key')).toHaveValue('google-key');
  });

  it('생성한 프롬프트가 히스토리로 저장된다', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText('API Key'), 'k');
    await user.type(screen.getByRole('textbox', { name: '' }), '프로필 카드');
    await user.click(screen.getByRole('button', { name: '컴포넌트 생성' }));

    await screen.findByText(/컴포넌트 ·/);
    expect(JSON.parse(localStorage.getItem('rcg:prompt-history')!)).toEqual(['프로필 카드']);
  });

  it('저장된 프롬프트 히스토리를 복원해 보여준다', () => {
    localStorage.setItem('rcg:prompt-history', JSON.stringify(['저장된 프롬프트']));
    render(<App />);
    expect(screen.getByRole('button', { name: '저장된 프롬프트' })).toBeInTheDocument();
  });

  it('저장된 컴포넌트 목록을 복원해 보여준다', () => {
    localStorage.setItem(
      'rcg:components',
      JSON.stringify([{ id: '1', prompt: '복원 프롬프트', code: 'render(<div />)', createdAt: new Date().toISOString() }]),
    );
    render(<App />);
    expect(screen.getByText(/컴포넌트 ·/)).toBeInTheDocument();
  });
});
