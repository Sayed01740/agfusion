// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title AGFusionRegistry
 * @notice On-chain project identity for AGFusion on Arc Testnet.
 * @dev Custom app contract — separate from Circle USDC/CCTP/App Kit contracts.
 *
 * Stores:
 *  - project metadata URI (website, logo, docs)
 *  - owner wallet
 *  - optional agent / product registrations linked to this project
 *
 * Deploy with Foundry on Arc Testnet (chainId 5042002). Gas is paid in USDC.
 */
contract AGFusionRegistry {
    string public constant PROJECT_NAME = "AGFusion";
    string public constant VERSION = "1.0.0";

    address public owner;
    string public metadataURI;
    bool public active;

    struct Registration {
        string name;
        string kind; // e.g. "agent", "module", "endpoint"
        string uri;
        address registrant;
        uint64 registeredAt;
        bool active;
    }

    Registration[] private _registrations;
    mapping(bytes32 => uint256) private _idToIndex; // keccak256(name,kind) => index+1
    mapping(address => uint256[]) private _byRegistrant;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event MetadataUpdated(string metadataURI);
    event ProjectActivated(bool active);
    event Registered(
        uint256 indexed id,
        string name,
        string kind,
        string uri,
        address indexed registrant
    );
    event RegistrationStatus(uint256 indexed id, bool active);

    error NotOwner();
    error EmptyString();
    error AlreadyExists();
    error InvalidId();
    error ZeroAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /**
     * @param metadataURI_ HTTPS/IPFS URI for project JSON
     *        e.g. https://agfusion.vercel.app/identity/agfusion-agent.json
     */
    constructor(string memory metadataURI_) {
        if (bytes(metadataURI_).length == 0) revert EmptyString();
        owner = msg.sender;
        metadataURI = metadataURI_;
        active = true;
        emit OwnershipTransferred(address(0), msg.sender);
        emit MetadataUpdated(metadataURI_);
        emit ProjectActivated(true);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setMetadataURI(string calldata metadataURI_) external onlyOwner {
        if (bytes(metadataURI_).length == 0) revert EmptyString();
        metadataURI = metadataURI_;
        emit MetadataUpdated(metadataURI_);
    }

    function setActive(bool active_) external onlyOwner {
        active = active_;
        emit ProjectActivated(active_);
    }

    /**
     * @notice Register a product module or agent under AGFusion.
     * @param name Human label (e.g. "AGFusion Agent")
     * @param kind Category (e.g. "agent", "bridge-ui", "studio")
     * @param uri Metadata URI for this registration
     */
    function register(
        string calldata name,
        string calldata kind,
        string calldata uri
    ) external returns (uint256 id) {
        if (bytes(name).length == 0 || bytes(kind).length == 0) revert EmptyString();
        bytes32 key = keccak256(abi.encodePacked(name, "|", kind));
        if (_idToIndex[key] != 0) revert AlreadyExists();

        id = _registrations.length;
        _registrations.push(
            Registration({
                name: name,
                kind: kind,
                uri: uri,
                registrant: msg.sender,
                registeredAt: uint64(block.timestamp),
                active: true
            })
        );
        _idToIndex[key] = id + 1;
        _byRegistrant[msg.sender].push(id);

        emit Registered(id, name, kind, uri, msg.sender);
    }

    function setRegistrationActive(uint256 id, bool active_) external {
        if (id >= _registrations.length) revert InvalidId();
        Registration storage r = _registrations[id];
        if (msg.sender != r.registrant && msg.sender != owner) revert NotOwner();
        r.active = active_;
        emit RegistrationStatus(id, active_);
    }

    function registrationCount() external view returns (uint256) {
        return _registrations.length;
    }

    function getRegistration(uint256 id) external view returns (Registration memory) {
        if (id >= _registrations.length) revert InvalidId();
        return _registrations[id];
    }

    function registrationsOf(address who) external view returns (uint256[] memory) {
        return _byRegistrant[who];
    }

    /// @notice Snapshot for explorers / AGFusion UI
    function projectInfo()
        external
        view
        returns (
            string memory name,
            string memory version,
            address projectOwner,
            string memory uri,
            bool isActive,
            uint256 totalRegistrations
        )
    {
        return (
            PROJECT_NAME,
            VERSION,
            owner,
            metadataURI,
            active,
            _registrations.length
        );
    }
}
