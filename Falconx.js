const path = require('path');
const each = require('each.js');
const getFuncArgs = require('get-func-args');
const EnvironmentLoader = require('./_/EnvironmentLoader');
const ServiceContainer = require('./_/ServiceContainer');
const InstanceProxy = require('./_/InstanceProxy');
const helpers = require('./_/helpers');

const validations = {};
const errors = {};

/**
 * TODO:
 * 1. add tags: [] support for dependencies
 * 2. auto-inject dependencies on specified functions when they are called
 * 3. storage inside framework capable of saving objects inside for usage in extends
 * 4. addCommands and runCommands, addTests and runTests
 * 5. use some specific functions for di Config(), Environment(), Factory(), Helper(), Service()
 *    in order to check if di is static or not (if dependency instanceof Service)
 *    and because its less error prone
 */

/**
 * Representing Falconx.
 */
class Falconx {
  /**
   * @constructor
   */
  constructor(configs = {}) {
    validations.classConstructor(configs);
    this._init(configs);
    return InstanceProxy(this, validations);
  }

  /**
   * Init.
   * @param configs
   * @private
   */
  _init(configs) {
    this._setConfigs(configs);
    this._environmentLoader = new EnvironmentLoader(this.getDirectory('environment'));
    this._serviceContainer = new ServiceContainer(this.getDirectory.bind(this), this._dependencyResolver.bind(this));
  }

  /**
   * Setup configs.
   * @param configs
   * @private
   */
  _setConfigs(configs) {
    this._root = configs.root || __dirname;
    this._directories = {
      command: configs.commands || 'commands',
      config: configs.configs || 'configs',
      environment: configs.environments || 'environments',
      factory: configs.factories || 'factories',
      helper: configs.helpers || 'helpers',
      service: configs.services || 'services',
      test: configs.tests || 'tests',
    };
    // format directories
    Object.keys(this._directories).forEach((entity) => {
      this._directories[entity] = path.join(this._root, ...this._directories[entity].split('.'));
    });
    // identifiers
    this._commandIdentifiers = new Map();
    this._testIdentifiers = new Map();
  }

  /**
   * Get root.
   * @return {*}
   */
  getRoot() {
    return this._root;
  }

  /**
   * Get directory.
   * @param entity
   * @return {*}
   */
  getDirectory(entity) {
    if (!(entity in this._directories)) {
      throw new Error(`Trying to get directory on unknown entity '${entity}'.`);
    }
    return this._directories[entity];
  }

  /**
   * Load environment.
   * @param name
   * @return {Promise<void>}
   */
  async loadEnvironment(name) {
    return this._environmentLoader.load(name);
  }

  /**
   * Add services from configs.
   * @param name
   * @returns {Promise<void>}
   */
  async addServicesFromConfig(name) {
    const services = await this._dependencyResolver({ name, type: 'config', prop: '' });
    await this.addServices(services);
  }

  /**
   * Add services.
   * @param services
   * @return {Promise<*|Promise<Array>>}
   */
  async addServices(services) {
    return each.series(services, this.addService.bind(this));
  }

  /**
   * Set service.
   * @param service
   * @return {Promise<*>}
   */
  async addService(service) {
    if (!this._environmentLoader.isLoaded()) {
      throw new Error('Trying to add service without loading environment first.');
    }
    return this._serviceContainer.set(service);
  }

  /**
   * Get service.
   * @param serviceName
   * @return {Promise<{}>}
   */
  async getService(serviceName) {
    if (!this._environmentLoader.isLoaded()) {
      throw new Error('Trying to get service without loading environment first.');
    }
    return this._serviceContainer.get(serviceName);
  }

  /**
   * Get services by namespace.
   * @param namespace
   * @param formatter
   * @returns {Promise<void>}
   */
  async getServicesByNamespace(namespace, formatter) {
    if (!this._environmentLoader.isLoaded()) {
      throw new Error('Trying to get service without loading environment first.');
    }
    const names = this._serviceContainer.getServiceNamesByNamespace(namespace);
    const services = {};
    await each.series(names, async (name) => {
      const serviceName = typeof formatter === 'function' ? formatter(name) : name;
      services[serviceName] = await this._serviceContainer.get(name);
    });
    return services;
  }

  /**
   * Add commands from configs.
   * @param name
   * @returns {Promise<void>}
   */
  async addCommandsFromConfig(name) {
    const commands = await this._dependencyResolver({ name, type: 'config', prop: '' });
    await this.addCommands(commands);
  }

  /**
   * Add services.
   * @param commands
   * @return {Promise<*|Promise<Array>>}
   */
  async addCommands(commands) {
    return each.series(commands, this.addCommand.bind(this));
  }

  /**
   * Add command.
   * @param command
   * @return {Promise<*>}
   */
  async addCommand(command) {
    if (!this._environmentLoader.isLoaded()) {
      throw new Error('Trying to add command without loading environment first.');
    }
    try {
      command.from = 'command';
      command.identifier = helpers.Service.randomIdentifier();
      const service = await this._serviceContainer.set(command);
      this._commandIdentifiers.set(service.realIdentifier, service.identifier);
    } catch (err) {
      err.message = err.message.replace('service', 'command').replace('Service', 'Command');
      throw err;
    }
  }

  /**
   * Execute command.
   * @param commandName
   * @return {Promise<*>}
   */
  async execCommand(commandName) {
    if (!this._environmentLoader.isLoaded()) {
      throw new Error('Trying to execute command without loading environment first.');
    }
    if (!this._commandIdentifiers.has(commandName)) {
      throw new Error(`Command '${commandName}' not found.`);
    }
    const identifier = this._commandIdentifiers.get(commandName);
    return this._serviceContainer.get(identifier);
  }

  /**
   * Add tests from configs.
   * @param name
   * @returns {Promise<void>}
   */
  async addTestsFromConfig(name) {
    const tests = await this._dependencyResolver({ name, type: 'config', prop: '' });
    await this.addTests(tests);
  }

  /**
   * Add services.
   * @param tests
   * @return {Promise<*|Promise<Array>>}
   */
  async addTests(tests) {
    return each.series(tests, this.addTest.bind(this));
  }

  /**
   * Add test.
   * @param test
   * @return {Promise<*>}
   */
  async addTest(test) {
    if (!this._environmentLoader.isLoaded()) {
      throw new Error('Trying to add test without loading environment first.');
    }
    try {
      test.from = 'test';
      test.identifier = helpers.Service.randomIdentifier();
      const service = await this._serviceContainer.set(test);
      this._testIdentifiers.set(service.realIdentifier, service.identifier);
    } catch (err) {
      err.message = err.message.replace('service', 'test').replace('Service', 'Test');
      throw err;
    }
  }

  /**
   * Run test.
   * @param testName
   * @return {Promise<*>}
   */
  async runTest(testName) {
    if (!this._environmentLoader.isLoaded()) {
      throw new Error('Trying to run test without loading environment first.');
    }
    if (!this._testIdentifiers.has(testName)) {
      throw new Error(`Test '${testName}' not found.`);
    }
    const identifier = this._testIdentifiers.get(testName);
    return this._serviceContainer.get(identifier);
  }

  /**
   * Resolve dependency.
   * @param dependency
   * @return {Promise<*>}
   * @private
   */
  async _dependencyResolver(dependency) {
    if (dependency.type === 'static') {
      if (typeof dependency.value === 'function') {
        const funcArgs = getFuncArgs(dependency.value).map(arg => arg.toLowerCase());
        return (...args) => {
          return dependency.value(...funcArgs.map(arg => {
            if (arg === 'falconx') {
              return this;
            }
            return args.shift();
          }));
        };
      }
      return dependency.value;
    }
    if (dependency.exported) { // if resolved before
      return dependency.exported;
    }
    if (dependency.type === 'environment') {
      dependency.exported = this._environment;
    } else { // generate path and resolve dependency
      dependency.path = path.join(this._directories[dependency.type], ...dependency.name.split('.'));
      try {
        dependency.exported = await require(dependency.path);
      } catch (err) {
        err.message = `Can't load ${dependency.type} '${dependency.name}' using path '${dependency.path}'. Message: ${err.message}`;
        throw err;
      }
    }
    // resolve dependency prop
    try {
      dependency.exported = helpers.getObjectProperty(dependency.exported, dependency.prop);
    } catch (err) {
      throw new Error(`${dependency.type.charAt(0).toUpperCase()}${dependency.type.substring(1)} '${dependency.name}' property '${dependency.prop}' not found.`);
    }
    return dependency.exported;
  }
}

/**
 * Validations
 */
validations.classConstructor = (configs) => { // eslint-disable-line
  // TODO: validations
};
Falconx.validations = validations;
/**
 * Errors
 */
Falconx.errors = errors;

module.exports = Falconx;
