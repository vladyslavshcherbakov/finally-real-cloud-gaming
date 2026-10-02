Before you start a task, read ROADMAP.md. Before you change code, read CONTRIBUTING.md.

An agent may commit without asking. It may push only to its own `claude/` branch.

An agent does not run tests, renders or measurements to check its changes. The owner tests every change on real devices and sends the logs. CI runs `Scripts/test.sh`.
