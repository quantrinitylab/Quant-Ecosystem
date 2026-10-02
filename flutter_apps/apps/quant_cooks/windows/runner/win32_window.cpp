#include "win32_window.h"

#include <flutter_windows.h>

#include "resource.h"

namespace {

constexpr const wchar_t kWindowClassName[] = L"FLUTTER_RUNNER_WIN32_WINDOW";

// The number of active Win32Window instances.
size_t g_active_window_count = 0;

using EnableNonClientDpiScaling = BOOL __stdcall(HWND hwnd);

// Scales the given rectangle for DPI.
void ScaleRect(RECT* rect, double scale) {
  rect->left = static_cast<LONG>(rect->left * scale);
  rect->top = static_cast<LONG>(rect->top * scale);
  rect->right = static_cast<LONG>(rect->right * scale);
  rect->bottom = static_cast<LONG>(rect->bottom * scale);
}

}  // namespace

// Manages the Win32Window's window class registration.
class WindowClassRegistrar {
 public:
  ~WindowClassRegistrar() {
    UnregisterWindowClass();
  }

  // Returns the singleton registrar instance.
  static WindowClassRegistrar* GetInstance() {
    static WindowClassRegistrar instance;
    return &instance;
  }

  // Returns the name of the window class, registering the class if it
  // hasn't already been registered.
  const wchar_t* GetWindowClass() {
    if (!class_registered_) {
      WNDCLASS window_class{};
      window_class.hCursor = LoadCursor(nullptr, IDC_ARROW);
      window_class.lpszClassName = kWindowClassName;
      window_class.style = CS_HREDRAW | CS_VREDRAW;
      window_class.cbClsExtra = 0;
      window_class.cbWndExtra = 0;
      window_class.hInstance = GetModuleHandle(nullptr);
      window_class.hIcon =
          LoadIcon(window_class.hInstance, MAKEINTRESOURCE(IDI_APP_ICON));
      window_class.hbrBackground = 0;
      window_class.lpfnWndProc = Win32Window::WndProc;
      RegisterClass(&window_class);
      class_registered_ = true;
    }
    return kWindowClassName;
  }

  void UnregisterWindowClass() {
    if (class_registered_) {
      UnregisterClass(kWindowClassName, GetModuleHandle(nullptr));
      class_registered_ = false;
    }
  }

 private:
  WindowClassRegistrar() = default;
  bool class_registered_ = false;
};

Win32Window::Win32Window() {
  ++g_active_window_count;
}

Win32Window::~Win32Window() {
  --g_active_window_count;
  Destroy();
}

bool Win32Window::Create(const std::wstring& title,
                         const Point& origin,
                         const Size& size) {
  Destroy();

  const wchar_t* window_class =
      WindowClassRegistrar::GetInstance()->GetWindowClass();

  const POINT target_point = {static_cast<LONG>(origin.x),
                              static_cast<LONG>(origin.y)};
  HMONITOR monitor = MonitorFromPoint(target_point, MONITOR_DEFAULTTONEAREST);
  UINT dpi = FlutterDesktopGetDpiForMonitor(monitor);
  double scale_factor = dpi / 96.0;

  HWND window = CreateWindow(
      window_class, title.c_str(), WS_OVERLAPPEDWINDOW,
      static_cast<int>(origin.x * scale_factor),
      static_cast<int>(origin.y * scale_factor),
      static_cast<int>(size.width * scale_factor),
      static_cast<int>(size.height * scale_factor),
      nullptr, nullptr, GetModuleHandle(nullptr), this);

  if (!window) {
    return false;
  }

  return OnCreate();
}

bool Win32Window::Show() {
  return ShowWindow(window_handle_, SW_SHOWNORMAL);
}

void Win32Window::Destroy() {
  if (window_handle_) {
    DestroyWindow(window_handle_);
    window_handle_ = nullptr;
  }
}

void Win32Window::SetChildContent(HWND content) {
  child_content_ = content;
  SetParent(content, window_handle_);
  RECT frame = GetClientArea();
  MoveWindow(content, 0, 0, frame.right - frame.left, frame.bottom - frame.top,
             TRUE);
}

HWND Win32Window::GetHandle() const {
  return window_handle_;
}

void Win32Window::SetQuitOnClose(bool quit_on_close) {
  quit_on_close_ = quit_on_close;
}

RECT Win32Window::GetClientArea() const {
  RECT frame;
  GetClientRect(window_handle_, &frame);
  return frame;
}

LRESULT Win32Window::MessageHandler(HWND hwnd,
                                    UINT const message,
                                    WPARAM const wparam,
                                    LPARAM const lparam) noexcept {
  switch (message) {
    case WM_DESTROY:
      window_handle_ = nullptr;
      Destroy();
      if (quit_on_close_) {
        PostQuitMessage(0);
      }
      return 0;

    case WM_SIZE: {
      RECT rect = GetClientArea();
      if (child_content_ != nullptr) {
        MoveWindow(child_content_, 0, 0, rect.right - rect.left,
                   rect.bottom - rect.top, TRUE);
      }
      return 0;
    }

    case WM_ACTIVATE:
      if (child_content_ != nullptr) {
        SetFocus(child_content_);
      }
      return 0;
  }

  return DefWindowProc(hwnd, message, wparam, lparam);
}

bool Win32Window::OnCreate() {
  return true;
}

void Win32Window::OnDestroy() {}

LRESULT CALLBACK Win32Window::WndProc(HWND const window,
                                      UINT const message,
                                      WPARAM const wparam,
                                      LPARAM const lparam) noexcept {
  if (message == WM_NCCREATE) {
    auto window_struct = reinterpret_cast<CREATESTRUCT*>(lparam);
    SetWindowLongPtr(window, GWLP_USERDATA,
                     reinterpret_cast<LONG_PTR>(window_struct->lpCreateParams));

    auto that = static_cast<Win32Window*>(window_struct->lpCreateParams);
    that->window_handle_ = window;
  } else if ( Win32Window* that = GetThisFromHandle(window)) {
    return that->MessageHandler(window, message, wparam, lparam);
  }

  return DefWindowProc(window, message, wparam, lparam);
}

Win32Window* Win32Window::GetThisFromHandle(HWND const window) noexcept {
  return reinterpret_cast<Win32Window*>(
      GetWindowLongPtr(window, GWLP_USERDATA));
}
