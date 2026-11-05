import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderUi } from '../test/render';
import { PushToggle } from './PushToggle';

const push = vi.hoisted(() => ({ currentSubscription: vi.fn(), enablePush: vi.fn(), disablePush: vi.fn(), pushSupported: vi.fn() }));
vi.mock('./push', () => push);

beforeEach(() => {
  push.pushSupported.mockReturnValue(true);
  push.currentSubscription.mockResolvedValue(null);
  push.enablePush.mockResolvedValue(undefined);
  push.disablePush.mockResolvedValue(undefined);
});
const box = () => screen.getByRole('checkbox', { name: /Notify me on this device/ }) as HTMLInputElement;

describe('PushToggle', () => {
  it('says so when the browser cannot do push', async () => {
    push.pushSupported.mockReturnValue(false);
    renderUi(<PushToggle />);
    expect(await screen.findByText('This browser does not support push notifications.')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
  it('starts on when this device is already subscribed', async () => {
    push.currentSubscription.mockResolvedValue({ endpoint: 'https://push.test/1' });
    renderUi(<PushToggle />);
    await waitFor(() => expect(box().checked).toBe(true));
  });
  it('turning on subscribes and turning off unsubscribes', async () => {
    renderUi(<PushToggle />);
    await waitFor(() => expect(push.currentSubscription).toHaveBeenCalled());
    await userEvent.click(box());
    await waitFor(() => expect(box().checked).toBe(true));
    expect(push.enablePush).toHaveBeenCalledTimes(1);
    await userEvent.click(box());
    await waitFor(() => expect(box().checked).toBe(false));
    expect(push.disablePush).toHaveBeenCalledTimes(1);
  });
  it('a refusal shows the reason, stays off and can be tried again', async () => {
    push.enablePush.mockRejectedValue(new Error('Notifications are blocked in this browser'));
    renderUi(<PushToggle />);
    await userEvent.click(box());
    expect(await screen.findByText('Notifications are blocked in this browser')).toBeTruthy();
    expect(box().checked).toBe(false);
    expect(box().disabled).toBe(false);
  });
});
