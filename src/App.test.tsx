import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

const encoder = new TextEncoder();
const line = (event: object) => encoder.encode(`${JSON.stringify(event)}\n`);
const CONFIG_RESPONSE = {
  ok: true,
  json: async () => ({ envKeys: { anthropic: false, google: false } }),
};
const FINAL_CODE = 'const A = () => <div />;\nrender(<A />);';

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/config') return CONFIG_RESPONSE;
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(line({ delta: FINAL_CODE }));
          c.enqueue(line({ done: true, code: FINAL_CODE }));
          c.close();
        },
      });
      return { ok: true, body };
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

  it('입력한 API 키는 localStorage에 저장되지 않는다', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText('API Key'), 'AIza-test');

    expect(localStorage.getItem('rcg:api-keys')).toBeNull();
    for (let i = 0; i < localStorage.length; i++) {
      expect(localStorage.getItem(localStorage.key(i)!)).not.toContain('AIza-test');
    }
  });

  it('이전 버전이 저장해 둔 API 키는 복원하지 않는다', () => {
    localStorage.setItem('rcg:api-keys', JSON.stringify({ anthropic: '', google: 'old-key' }));
    render(<App />);
    expect(screen.getByLabelText('API Key')).toHaveValue('');
  });

  it('이전 버전이 저장해 둔 API 키는 localStorage에서 삭제된다', () => {
    localStorage.setItem('rcg:api-keys', JSON.stringify({ anthropic: '', google: 'old-key' }));
    render(<App />);
    expect(localStorage.getItem('rcg:api-keys')).toBeNull();
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

  it('생성에 실패한 프롬프트는 히스토리에 저장되지 않는다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/config') {
          return { ok: true, json: async () => ({ envKeys: { anthropic: false, google: false } }) };
        }
        return { ok: false, json: async () => ({ error: '서버 오류' }) };
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText('API Key'), 'k');
    await user.type(screen.getByRole('textbox', { name: '' }), '실패할 프롬프트');
    await user.click(screen.getByRole('button', { name: '컴포넌트 생성' }));

    await screen.findByText(/서버 오류/);
    expect(localStorage.getItem('rcg:prompt-history')).toBeNull();
  });

  it('저장된 프롬프트 히스토리를 복원해 보여준다', () => {
    localStorage.setItem('rcg:prompt-history', JSON.stringify(['저장된 프롬프트']));
    render(<App />);
    expect(screen.getByRole('button', { name: '저장된 프롬프트' })).toBeInTheDocument();
  });

  it('생성 중에는 코드 탭에 스트리밍되는 코드를 보여주고, 완료되면 미리보기 탭을 선택한다', async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url === '/api/config' ? CONFIG_RESPONSE : { ok: true, body },
      ),
    );
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText('API Key'), 'k');
    await user.type(screen.getByRole('textbox', { name: '' }), '카드');
    await user.click(screen.getByRole('button', { name: '컴포넌트 생성' }));

    controller.enqueue(line({ delta: 'const Partial' }));
    expect(await screen.findByText('const Partial')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '코드' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '미리보기' })).toHaveAttribute('aria-selected', 'false');

    controller.enqueue(line({ delta: ' = 1;' }));
    controller.enqueue(line({ done: true, code: FINAL_CODE }));
    controller.close();

    await screen.findByText(/컴포넌트 ·/);
    expect(screen.queryByText('const Partial = 1;')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '미리보기' })).toHaveAttribute('aria-selected', 'true');
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
