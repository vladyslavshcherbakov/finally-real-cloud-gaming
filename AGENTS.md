Before you start a task, read ROADMAP.md. Before you change code, read CONTRIBUTING.md.

An agent may commit without asking. It may push only to its own `claude/` branch.

An agent runs `Scripts/test.sh` before a push only when the push changes logic: JavaScript or WGSL that decides behaviour, kernel bindings or kernel lists, `AppGraph`, or the body of a test or of the test harness.
An agent does not run the tests for a push that only changes numbers or default values, documents, commit messages, or the file a test lives in while its body stays the same.
An agent does not run the tests again when nothing that decides behaviour changed since the last green run.
When the changed logic stays inside the area of one test file, an agent runs only that file, and runs the whole suite only when the change reaches more than one area.
An agent runs no renders, measurements or scripts of its own to check a change. The owner tests every change on real devices and sends the logs.
