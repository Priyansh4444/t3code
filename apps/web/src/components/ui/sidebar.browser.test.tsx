import { page, userEvent } from "vite-plus/test/browser";
import { describe, expect, it, vi } from "vite-plus/test";

import { render } from "../../../test/render";
import { Sidebar, SidebarProvider, SidebarRail, SidebarTrigger, useSidebar } from "./sidebar";

function CollapseFromInside() {
  const { setOpen } = useSidebar();
  return (
    <button type="button" onClick={() => setOpen(false)}>
      Collapse
    </button>
  );
}

function Harness(props: {
  readonly onResize?: (width: number) => void;
  readonly mobileBreakpoint?: number;
}) {
  return (
    <SidebarProvider
      defaultOpen
      {...(props.mobileBreakpoint ? { mobileBreakpoint: props.mobileBreakpoint } : {})}
    >
      <Sidebar
        collapsible="offcanvas"
        resizable={{
          minWidth: 200,
          maxWidth: 600,
          ...(props.onResize ? { onResize: props.onResize } : {}),
        }}
      >
        <CollapseFromInside />
        <SidebarRail />
      </Sidebar>
      <SidebarTrigger />
    </SidebarProvider>
  );
}

describe("Sidebar", () => {
  it("hands focus to the outside trigger when it collapses around the focused control", async () => {
    await page.viewport(1280, 800);
    await using screen = await render(<Harness />, { router: false /* no routes involved */ });

    await userEvent.click(screen.getByRole("button", { name: "Collapse" }));

    const sidebar = screen.container.querySelector<HTMLElement>('[data-slot="sidebar"]')!;
    await vi.waitFor(() => expect(sidebar.inert).toBe(true));
    const trigger = screen.container.querySelector('[data-slot="sidebar-trigger"]');
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("abandons a rail drag when the sidebar collapses mid-drag", async () => {
    await page.viewport(1280, 800);
    const onResize = vi.fn();
    await using screen = await render(<Harness onResize={onResize} />, {
      router: false /* no routes involved */,
    });
    const rail = screen.container.querySelector<HTMLElement>('[data-sidebar="rail"]')!;
    const { left, top } = rail.getBoundingClientRect();
    const pointer = { bubbles: true, cancelable: true, pointerId: 1, button: 0, clientY: top + 10 };
    const dragTo = (clientX: number) => {
      rail.dispatchEvent(new PointerEvent("pointerdown", { ...pointer, clientX: left }));
      rail.dispatchEvent(new PointerEvent("pointermove", { ...pointer, clientX }));
    };
    // A completed drag commits, so the abandoned one below is a real drag too.
    dragTo(left + 40);
    rail.dispatchEvent(new PointerEvent("pointerup", { ...pointer, clientX: left + 40 }));
    expect(onResize).toHaveBeenCalledTimes(1);

    dragTo(left + 80);
    await userEvent.click(
      screen.container.querySelector<HTMLElement>('[data-slot="sidebar-trigger"]')!,
    );
    rail.dispatchEvent(new PointerEvent("pointerup", { ...pointer, clientX: left + 80 }));

    expect(onResize).toHaveBeenCalledTimes(1);
  });

  it("toggles the sheet below a custom breakpoint without collapsing the docked sidebar", async () => {
    // Between the default 768px cutoff and the layout's own breakpoint.
    await page.viewport(820, 800);
    await using screen = await render(<Harness mobileBreakpoint={900} />, {
      router: false /* no routes involved */,
    });
    const wrapper = screen.container.querySelector<HTMLElement>('[data-slot="sidebar-wrapper"]')!;
    const trigger = screen.container.querySelector<HTMLElement>('[data-slot="sidebar-trigger"]')!;
    await vi.waitFor(() => expect(wrapper.dataset.sidebarMobile).toBe("true"));
    expect(wrapper.dataset.sidebarState).toBe("collapsed");

    await userEvent.click(trigger);
    await expect.element(page.getByRole("button", { name: "Collapse" })).toBeVisible();
    expect(document.querySelector('[data-mobile="true"][data-slot="sidebar"]')).not.toBeNull();
    expect(wrapper.dataset.sidebarState).toBe("expanded");

    await userEvent.keyboard("{Escape}");
    await vi.waitFor(() => expect(wrapper.dataset.sidebarState).toBe("collapsed"));

    await page.viewport(1280, 800);
    await vi.waitFor(() => expect(wrapper.dataset.sidebarMobile).toBe("false"));
    expect(wrapper.dataset.sidebarState).toBe("expanded");
  });
});
