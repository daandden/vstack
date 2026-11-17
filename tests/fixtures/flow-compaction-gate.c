#include <sqlite3.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

static const sqlite3_io_methods *original;
static sqlite3_io_methods instrumented;
static const char *entered;
static const char *release;

static void mark(void) {
  FILE *file = fopen(entered, "w");
  if (file) fclose(file);
}

static int file_control(sqlite3_file *file, int operation, void *argument) {
  if (release && operation == SQLITE_FCNTL_OVERWRITE) {
    mark();
    for (int attempt = 0; attempt < 5000; attempt++) {
      if (access(release, F_OK) == 0) return original->xFileControl(file, operation, argument);
      usleep(1000);
    }
    return SQLITE_IOERR;
  }
  return original->xFileControl(file, operation, argument);
}

static int shm_lock(sqlite3_file *file, int offset, int count, int flags) {
  if (!release && (flags & SQLITE_SHM_LOCK) && (flags & SQLITE_SHM_EXCLUSIVE)) mark();
  return original->xShmLock(file, offset, count, flags);
}

void compaction_gate_install(sqlite3_file *file) {
  entered = getenv("FLOW_COMPACTION_ENTERED");
  release = getenv("FLOW_COMPACTION_RELEASE");
  original = file->pMethods;
  instrumented = *original;
  instrumented.xFileControl = file_control;
  instrumented.xShmLock = shm_lock;
  file->pMethods = &instrumented;
}
