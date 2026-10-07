#ifndef RUNNER_MY_APPLICATION_H_
#define RUNNER_MY_APPLICATION_H_

#include <gtk/gtk.h>

G_DECLARE_FINAL_TYPE(MyApplication, my_application, MY, APPLICATION,
                     GtkApplication)

MyApplication* my_application_new();

#endif  // RUNNER_MY_APPLICATION_H_
