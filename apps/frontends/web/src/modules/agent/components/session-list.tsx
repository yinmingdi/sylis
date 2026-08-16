import {
  AgentSessionStatus,
  type AgentSessionView,
} from '@sylis/api-client/agent';
import {
  Archive,
  Bot,
  Check,
  FileText,
  IconButton,
  Plus,
  Search,
  SquarePen,
  TextInput,
  Trash2,
  X,
} from '@sylis/components';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  NavLink,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';

import { useCurrentUserId } from '../../identity';
import { agentCommands } from '../api/commands';
import { agentQueries } from '../api/queries';

export function AgentSessionDrawer({
  open,
  sessions,
  creating,
  onCreate,
  onClose,
  onNavigate,
}: {
  open: boolean;
  sessions: readonly AgentSessionView[];
  creating: boolean;
  onCreate: () => void;
  onClose: () => void;
  onNavigate: () => void;
}) {
  const userId = useCurrentUserId();
  const cache = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('q')?.trim() ?? '';
  const visibleSessions = sessions.filter(
    (session) =>
      session.status !== AgentSessionStatus.ARCHIVED &&
      (!search ||
        session.title.toLocaleLowerCase().includes(search.toLocaleLowerCase())),
  );
  const [editingId, setEditingId] = useState<string>();
  const [title, setTitle] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string>();
  const containerRef = useRef<HTMLElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement) {
        restoreFocusRef.current = activeElement;
      }
      containerRef.current
        ?.querySelector<HTMLElement>('[data-drawer-close]')
        ?.focus();
    } else if (!open && wasOpenRef.current) {
      restoreFocusRef.current?.focus();
      restoreFocusRef.current = null;
    }
    wasOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !containerRef.current) return;
      const focusable = Array.from(
        containerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);
  const update = useMutation({
    mutationFn: (input: { id: string; title?: string; archived?: boolean }) =>
      agentCommands.sessions.update(input.id, {
        ...(input.title ? { title: input.title } : {}),
        ...(input.archived === undefined ? {} : { archived: input.archived }),
      }),
    onSuccess: async () => {
      setEditingId(undefined);
      await cache.invalidateQueries({
        queryKey: agentQueries.sessions(userId).queryKey,
      });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => agentCommands.sessions.remove(id),
    onSuccess: async (_, id) => {
      setConfirmDeleteId(undefined);
      await cache.invalidateQueries({
        queryKey: agentQueries.sessions(userId).queryKey,
      });
      if (location.pathname.endsWith(`/sessions/${id}`)) navigate('/agent');
    },
  });
  return (
    <>
      <button
        type="button"
        className="agent-drawer-backdrop"
        data-open={open}
        aria-label="点击遮罩关闭会话历史"
        aria-hidden={!open}
        tabIndex={-1}
        onClick={onClose}
      />
      <aside
        ref={containerRef}
        className="agent-sessions"
        data-open={open}
        role="dialog"
        aria-modal="true"
        aria-label="会话历史"
        aria-hidden={!open}
        inert={!open}
      >
        <div className="agent-sessions__heading">
          <strong>会话历史</strong>
          <div>
            <NavLink
              to="/agent/assets"
              className="sy-icon-button"
              aria-label="Agent 文件"
              title="Agent 文件"
              onClick={onNavigate}
            >
              <FileText aria-hidden="true" size={19} strokeWidth={1.8} />
            </NavLink>
            <IconButton
              icon={Plus}
              label="新建会话"
              disabled={creating}
              onClick={() => {
                onClose();
                onCreate();
              }}
            />
            <IconButton
              icon={X}
              label="关闭会话历史"
              data-drawer-close="true"
              onClick={onClose}
            />
          </div>
        </div>
        <label className="agent-sessions__search">
          <Search aria-hidden="true" size={16} />
          <TextInput
            aria-label="搜索会话"
            value={searchParams.get('q') ?? ''}
            onChange={(event) => {
              const next = new URLSearchParams(searchParams);
              const value = event.target.value;
              if (value) next.set('q', value);
              else next.delete('q');
              setSearchParams(next, { replace: true });
            }}
          />
        </label>
        <nav className="agent-sessions__list">
          {visibleSessions.map((session) => {
            const editing = editingId === session.id;
            const confirmingDelete = confirmDeleteId === session.id;
            return (
              <div className="agent-session-item" key={session.id}>
                {editing ? (
                  <form
                    className="agent-session-item__edit"
                    onSubmit={(event: FormEvent) => {
                      event.preventDefault();
                      if (title.trim()) {
                        update.mutate({ id: session.id, title: title.trim() });
                      }
                    }}
                  >
                    <input
                      aria-label="会话名称"
                      className="sy-input"
                      value={title}
                      maxLength={120}
                      autoFocus
                      onChange={(event) => setTitle(event.target.value)}
                    />
                    <IconButton
                      icon={Check}
                      label="保存名称"
                      type="submit"
                      disabled={update.isPending || !title.trim()}
                    />
                    <IconButton
                      icon={X}
                      label="取消修改"
                      onClick={() => setEditingId(undefined)}
                    />
                  </form>
                ) : (
                  <>
                    <NavLink
                      to={`/agent/sessions/${session.id}`}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        isActive ? 'active' : undefined
                      }
                    >
                      <Bot aria-hidden="true" size={17} />
                      <span>{session.title}</span>
                      <time dateTime={session.createdAt}>
                        {new Intl.DateTimeFormat('zh-CN', {
                          month: 'numeric',
                          day: 'numeric',
                        }).format(new Date(session.createdAt))}
                      </time>
                    </NavLink>
                    <div className="agent-session-item__actions">
                      {confirmingDelete ? (
                        <>
                          <IconButton
                            icon={Check}
                            label="确认删除"
                            tone="danger"
                            disabled={remove.isPending}
                            onClick={() => remove.mutate(session.id)}
                          />
                          <IconButton
                            icon={X}
                            label="取消删除"
                            onClick={() => setConfirmDeleteId(undefined)}
                          />
                        </>
                      ) : (
                        <>
                          <IconButton
                            icon={SquarePen}
                            label="重命名会话"
                            onClick={() => {
                              setTitle(session.title);
                              setEditingId(session.id);
                            }}
                          />
                          <IconButton
                            icon={Archive}
                            label="归档会话"
                            disabled={update.isPending}
                            onClick={() =>
                              update.mutate({ id: session.id, archived: true })
                            }
                          />
                          <IconButton
                            icon={Trash2}
                            label="删除会话"
                            tone="danger"
                            onClick={() => setConfirmDeleteId(session.id)}
                          />
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
          {visibleSessions.length === 0 ? (
            <p className="agent-sessions__empty">
              {search ? '没有匹配的会话' : '还没有会话'}
            </p>
          ) : null}
        </nav>
        {update.error || remove.error ? (
          <p className="form-error agent-sessions__error">
            {(update.error ?? remove.error)?.message}
          </p>
        ) : null}
      </aside>
    </>
  );
}
