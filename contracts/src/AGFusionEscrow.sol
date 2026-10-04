// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title AGFusionEscrow
 * @notice Production-grade on-chain escrow for AI Agents and Autonomous Tasks on Arc Network (chainId 5042002).
 * @dev Replaces simulation with verifiable on-chain lifecycle:
 *      1. Client creates escrow task and locks USDC (ERC-20 or native Arc USDC).
 *      2. AI Agent processes off-chain task and submits completion proof URI.
 *      3. Client releases payment upon verification.
 *      4. Automated refund if deadline expires before agent delivers.
 *      5. Non-custodial, reentrancy-guarded, and gas-efficient on Arc.
 */

interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract AGFusionEscrow {
    string public constant NAME = "AGFusionEscrow";
    string public constant VERSION = "1.0.0";

    enum TaskStatus {
        Active,      // Client funded, waiting for agent
        Submitted,   // Agent submitted proof, waiting for client release
        Released,    // Client released payment to agent
        Disputed,    // Dispute raised by either party
        Refunded     // Refunded back to client after expiration
    }

    struct Task {
        uint256 id;
        address client;
        address agent;
        address token;       // address(0) for native Arc USDC, or ERC-20 token address
        uint256 amount;
        uint256 createdAt;
        uint256 deadline;
        TaskStatus status;
        string taskDetailsUri;
        string proofUri;
    }

    uint256 private _taskIdCounter;
    mapping(uint256 => Task) public tasks;
    mapping(address => uint256[]) private _clientTasks;
    mapping(address => uint256[]) private _agentTasks;

    // --- Reentrancy guard ---
    uint256 private _entered = 1;
    modifier nonReentrant() {
        require(_entered == 1, "REENTRANCY");
        _entered = 2;
        _;
        _entered = 1;
    }

    // --- Events ---
    event TaskCreated(
        uint256 indexed taskId,
        address indexed client,
        address indexed agent,
        address token,
        uint256 amount,
        uint256 deadline,
        string taskDetailsUri
    );
    event ProofSubmitted(uint256 indexed taskId, address indexed agent, string proofUri);
    event PaymentReleased(uint256 indexed taskId, address indexed client, address indexed agent, uint256 amount);
    event TaskDisputed(uint256 indexed taskId, address indexed initiator, string reasonUri);
    event TaskRefunded(uint256 indexed taskId, address indexed client, uint256 amount);

    // --- Create Task (ERC-20 Token like Arc USDC) ---
    function createTask(
        address agent,
        address token,
        uint256 amount,
        uint256 durationSeconds,
        string calldata taskDetailsUri
    ) external nonReentrant returns (uint256 taskId) {
        require(agent != address(0) && agent != msg.sender, "INVALID_AGENT");
        require(token != address(0), "USE_NATIVE_METHOD");
        require(amount > 0, "ZERO_AMOUNT");
        require(durationSeconds >= 60, "DEADLINE_TOO_SHORT");

        _taskIdCounter++;
        taskId = _taskIdCounter;

        uint256 deadline = block.timestamp + durationSeconds;

        tasks[taskId] = Task({
            id: taskId,
            client: msg.sender,
            agent: agent,
            token: token,
            amount: amount,
            createdAt: block.timestamp,
            deadline: deadline,
            status: TaskStatus.Active,
            taskDetailsUri: taskDetailsUri,
            proofUri: ""
        });

        _clientTasks[msg.sender].push(taskId);
        _agentTasks[agent].push(taskId);

        // Pull tokens from client to escrow contract
        _safeTransferFrom(token, msg.sender, address(this), amount);

        emit TaskCreated(taskId, msg.sender, agent, token, amount, deadline, taskDetailsUri);
    }

    // --- Create Task with Native USDC (Arc native asset is USDC) ---
    function createTaskNative(
        address agent,
        uint256 durationSeconds,
        string calldata taskDetailsUri
    ) external payable nonReentrant returns (uint256 taskId) {
        require(agent != address(0) && agent != msg.sender, "INVALID_AGENT");
        require(msg.value > 0, "ZERO_AMOUNT");
        require(durationSeconds >= 60, "DEADLINE_TOO_SHORT");

        _taskIdCounter++;
        taskId = _taskIdCounter;

        uint256 deadline = block.timestamp + durationSeconds;

        tasks[taskId] = Task({
            id: taskId,
            client: msg.sender,
            agent: agent,
            token: address(0),
            amount: msg.value,
            createdAt: block.timestamp,
            deadline: deadline,
            status: TaskStatus.Active,
            taskDetailsUri: taskDetailsUri,
            proofUri: ""
        });

        _clientTasks[msg.sender].push(taskId);
        _agentTasks[agent].push(taskId);

        emit TaskCreated(taskId, msg.sender, agent, address(0), msg.value, deadline, taskDetailsUri);
    }

    // --- Agent Submits Completion Proof ---
    function submitProof(uint256 taskId, string calldata proofUri) external {
        Task storage task = tasks[taskId];
        require(task.id == taskId, "TASK_NOT_FOUND");
        require(msg.sender == task.agent, "ONLY_ASSIGNED_AGENT");
        require(task.status == TaskStatus.Active, "INVALID_STATUS");
        require(bytes(proofUri).length > 0, "EMPTY_PROOF");

        task.status = TaskStatus.Submitted;
        task.proofUri = proofUri;

        emit ProofSubmitted(taskId, msg.sender, proofUri);
    }

    // --- Client Releases Escrow Payment ---
    function releasePayment(uint256 taskId) external nonReentrant {
        Task storage task = tasks[taskId];
        require(task.id == taskId, "TASK_NOT_FOUND");
        require(msg.sender == task.client, "ONLY_CLIENT");
        require(
            task.status == TaskStatus.Active || task.status == TaskStatus.Submitted,
            "NOT_RELEASABLE"
        );

        uint256 amount = task.amount;
        address agent = task.agent;
        address token = task.token;

        task.status = TaskStatus.Released;

        if (token == address(0)) {
            (bool ok, ) = payable(agent).call{value: amount}("");
            require(ok, "NATIVE_TRANSFER_FAILED");
        } else {
            _safeTransfer(token, agent, amount);
        }

        emit PaymentReleased(taskId, msg.sender, agent, amount);
    }

    // --- Dispute Task ---
    function disputeTask(uint256 taskId, string calldata reasonUri) external {
        Task storage task = tasks[taskId];
        require(task.id == taskId, "TASK_NOT_FOUND");
        require(msg.sender == task.client || msg.sender == task.agent, "UNAUTHORIZED");
        require(
            task.status == TaskStatus.Active || task.status == TaskStatus.Submitted,
            "CANNOT_DISPUTE"
        );

        task.status = TaskStatus.Disputed;
        emit TaskDisputed(taskId, msg.sender, reasonUri);
    }

    // --- Refund Expired Task ---
    function refundExpired(uint256 taskId) external nonReentrant {
        Task storage task = tasks[taskId];
        require(task.id == taskId, "TASK_NOT_FOUND");
        require(msg.sender == task.client, "ONLY_CLIENT");
        require(task.status == TaskStatus.Active, "NOT_ACTIVE");
        require(block.timestamp >= task.deadline, "DEADLINE_NOT_PASSED");

        uint256 amount = task.amount;
        address client = task.client;
        address token = task.token;

        task.status = TaskStatus.Refunded;

        if (token == address(0)) {
            (bool ok, ) = payable(client).call{value: amount}("");
            require(ok, "NATIVE_REFUND_FAILED");
        } else {
            _safeTransfer(token, client, amount);
        }

        emit TaskRefunded(taskId, client, amount);
    }

    // --- View Helpers ---
    function getTask(uint256 taskId) external view returns (Task memory) {
        return tasks[taskId];
    }

    function totalTasks() external view returns (uint256) {
        return _taskIdCounter;
    }

    function getClientTasks(address client) external view returns (uint256[] memory) {
        return _clientTasks[client];
    }

    function getAgentTasks(address agent) external view returns (uint256[] memory) {
        return _agentTasks[agent];
    }

    // --- Safe ERC-20 internal helpers ---
    function _safeTransfer(address token, address to, uint256 amount) internal {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20Minimal.transfer.selector, to, amount)
        );
        require(success && (data.length == 0 || abi.decode(data, (bool))), "TRANSFER_FAILED");
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20Minimal.transferFrom.selector, from, to, amount)
        );
        require(success && (data.length == 0 || abi.decode(data, (bool))), "TRANSFER_FROM_FAILED");
    }

    receive() external payable {}
}
