import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const runnerDir = join(rootDir, ".devrunner");
const isWindows = process.platform === "win32";

const services = [
    {
        name: "backend",
        command: isWindows ? "python.exe" : "python",
        args: ["-m", "uvicorn", "--app-dir", "backend", "app.main:app", "--reload", "--reload-dir", "backend/app", "--host", "localhost", "--port", "8001"],
        port: 8001,
        pidFile: join(runnerDir, "backend.pid"),
        logFile: join(runnerDir, "backend.log"),
        url: "http://localhost:8001",
    },
    {
        name: "frontend",
        command: isWindows ? "cmd.exe" : "npm",
        args: isWindows
            ? ["/d", "/s", "/c", "npm --prefix frontend run dev -- --host localhost"]
            : ["--prefix", "frontend", "run", "dev", "--", "--host", "localhost"],
        port: 5180,
        pidFile: join(runnerDir, "frontend.pid"),
        logFile: join(runnerDir, "frontend.log"),
        url: "http://localhost:5180",
    },
];

const ensureRunnerDir = () => {
    if (!existsSync(runnerDir)) {
        mkdirSync(runnerDir, { recursive: true });
    }
};

const readPid = (pidFile) => {
    if (!existsSync(pidFile)) {
        return null;
    }
    const value = readFileSync(pidFile, "utf8").trim();
    const pid = Number(value);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
};

const writePid = (pidFile, pid) => {
    writeFileSync(pidFile, `${pid}\n`, "utf8");
};

const removePidFile = (pidFile) => {
    if (existsSync(pidFile)) {
        rmSync(pidFile, { force: true });
    }
};

const isRunning = (pid) => {
    if (!pid) {
        return false;
    }
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
};

const killProcessTree = (pid) => new Promise((resolve) => {
    if (!pid || !isRunning(pid)) {
        resolve(false);
        return;
    }

    if (process.platform === "win32") {
        const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
        killer.on("exit", () => resolve(true));
        killer.on("error", () => resolve(false));
        return;
    }

    try {
        process.kill(-pid, "SIGTERM");
        resolve(true);
    } catch {
        try {
            process.kill(pid, "SIGTERM");
            resolve(true);
        } catch {
            resolve(false);
        }
    }
});

const killPort = (port) => new Promise((resolve) => {
    const command = isWindows ? "cmd.exe" : "npx";
    const args = isWindows ? ["/d", "/s", "/c", `npx kill-port ${port}`] : ["kill-port", String(port)];
    const killer = spawn(command, args, { cwd: rootDir, stdio: "ignore", windowsHide: true });
    killer.on("exit", () => resolve(true));
    killer.on("error", () => resolve(false));
});

const startService = async (service) => {
    const existingPid = readPid(service.pidFile);
    if (isRunning(existingPid)) {
        console.log(`${service.name}: already running on PID ${existingPid}`);
        return;
    }

    ensureRunnerDir();
    await killPort(service.port);
    const logFd = openSync(service.logFile, "a");
    const child = spawn(service.command, service.args, {
        cwd: rootDir,
        env: process.env,
        detached: true,
        stdio: ["ignore", logFd, logFd],
        windowsHide: true,
    });

    child.once("error", (error) => {
        removePidFile(service.pidFile);
        console.error(`${service.name}: failed to start`);
        console.error(String(error));
    });

    if (!child.pid) {
        removePidFile(service.pidFile);
        console.error(`${service.name}: no PID returned`);
        return;
    }

    child.unref();
    writePid(service.pidFile, child.pid);
    console.log(`${service.name}: started on PID ${child.pid}`);
    console.log(`${service.name}: log -> ${service.logFile}`);
};

const stopService = async (service) => {
    const pid = readPid(service.pidFile);
    if (!pid) {
        console.log(`${service.name}: not running`);
        removePidFile(service.pidFile);
        return;
    }

    const stopped = await killProcessTree(pid);
    removePidFile(service.pidFile);
    console.log(`${service.name}: ${stopped ? `stopped PID ${pid}` : `PID ${pid} was not running`}`);
};

const statusService = (service) => {
    const pid = readPid(service.pidFile);
    if (isRunning(pid)) {
        console.log(`${service.name}: running on PID ${pid} (${service.url})`);
        return;
    }

    removePidFile(service.pidFile);
    console.log(`${service.name}: stopped`);
};

const command = process.argv[2] ?? "status";

if (command === "start") {
    ensureRunnerDir();
    for (const service of services) {
        await startService(service);
    }
    console.log("dev runner: background services requested");
} else if (command === "stop") {
    for (const service of [...services].reverse()) {
        await stopService(service);
    }
    console.log("dev runner: stop complete");
} else if (command === "restart") {
    for (const service of [...services].reverse()) {
        await stopService(service);
    }
    for (const service of services) {
        await startService(service);
    }
    console.log("dev runner: restart complete");
} else if (command === "status") {
    for (const service of services) {
        statusService(service);
    }
} else {
    console.error(`Unknown command: ${command}`);
    process.exitCode = 1;
}