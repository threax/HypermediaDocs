var jsnsOptions = jsnsOptions || {};
var jsnsDefine =function (options) {
        class JsModuleInstance {
            constructor(definition, loader) {
                this.definition = definition;
                this.loader = loader;
                this.exports = {};
            }
        }
        class JsModuleDefinition {
            constructor(name, depNames, factory, loader, source, isRunner, moduleCodeFinder) {
                this.source = source;
                this.isRunner = isRunner;
                this.moduleCodeFinder = moduleCodeFinder;
                this.dependencies = [];
                this.name = name;
                this.factory = factory;
                if (depNames) {
                    for (var i = 0; i < depNames.length; ++i) {
                        var depName = depNames[i];
                        this.dependencies.push({
                            name: depName,
                            loaded: loader.isModuleLoaded(depName)
                        });
                    }
                }
            }
            getModuleCode(ignoredSources) {
                if (ignoredSources.indexOf(this.source) !== -1) {
                    return '';
                }
                if (this.isRunner) {
                    return 'jsns.run("' + this.dependencies[0].name + '");\n';
                }
                if (this.moduleCodeFinder !== undefined) {
                    return this.moduleCodeFinder(this);
                }
                else {
                    return 'jsns.define("' + this.name + '", ' + this.getDependenciesArg() + ', ' + this.factory + ');\n';
                }
            }
            getDependenciesArg(preDependencies) {
                var deps = '[';
                var sep = '';
                if (preDependencies) {
                    for (var i = 0; i < preDependencies.length; ++i) {
                        deps += sep + '"' + preDependencies[i] + '"';
                        sep = ',';
                    }
                }
                for (var i = 0; i < this.dependencies.length; ++i) {
                    deps += sep + '"' + this.dependencies[i].name + '"';
                    sep = ',';
                }
                deps += ']';
                return deps;
            }
        }
        class ModuleManager {
            constructor(options) {
                this.loaded = {};
                this.loadedOrder = [];
                this.unloaded = {};
                this.runners = [];
                this.fromModuleRunners = null; //When calling run from a module you can't add the runner to the runner's list, this will accumulate the runners during that time.
                if (options === undefined) {
                    options = {};
                }
                this.options = options;
            }
            /**
             * Add a runner to the module manager. This will add the runner in such a way that more runners can be defined during
             * module execution. If such a run is invoked it will be deferred until the current module stops executing.
             * Because of this management, loadRunners will be called automaticly by the addRunner funciton. There is no reason
             * for a client class to call that function for runners, and in fact that can create errors.
             */
            addRunner(name, source) {
                var runnerModule = new JsModuleDefinition(name + "Runner", [name], this.runnerFunc, this, source, true);
                if (this.fromModuleRunners !== null) {
                    this.fromModuleRunners.push(runnerModule);
                }
                else {
                    this.runners.push(runnerModule);
                    this.loadRunners();
                }
            }
            /**
             * Add a module to the module manager. Due to the variety of ways that a module could be added the user is responsible for
             * calling loadRunners() when they are ready to try to load modules.
             */
            addModule(name, dependencies, factory, moduleWriter) {
                this.unloaded[name] = new JsModuleDefinition(name, dependencies, factory, this, undefined, false, moduleWriter);
            }
            isModuleLoaded(name) {
                return this.loaded[name] !== undefined;
            }
            isModuleLoadable(name) {
                return this.unloaded[name] !== undefined;
            }
            isModuleDefined(name) {
                return this.isModuleLoaded(name) || this.isModuleLoadable(name);
            }
            loadModule(name) {
                var loaded = this.checkModule(this.unloaded[name]);
                if (loaded) {
                    delete this.unloaded[name];
                }
                return loaded;
            }
            setModuleLoaded(name, module) {
                if (this.loaded[name] === undefined) {
                    this.loaded[name] = module;
                    this.loadedOrder.push(name);
                }
            }
            checkModule(check) {
                var dependencies = check.dependencies;
                var fullyLoaded = true;
                var module = undefined;
                //Check to see if depenedencies are loaded and if they aren't and can be, load them
                for (var i = 0; i < dependencies.length; ++i) {
                    var dep = dependencies[i];
                    dep.loaded = this.isModuleLoaded(dep.name);
                    if (!dep.loaded && this.isModuleLoadable(dep.name)) {
                        dep.loaded = this.loadModule(dep.name);
                    }
                    fullyLoaded = fullyLoaded && dep.loaded;
                }
                //If all dependencies are loaded, load this library
                if (fullyLoaded) {
                    module = new JsModuleInstance(check, this);
                    if (!this.options.simulateModuleLoading) {
                        var args = [module.exports, module];
                        //Inject dependency arguments
                        for (var i = 0; i < dependencies.length; ++i) {
                            var dep = dependencies[i];
                            args.push(this.loaded[dep.name].exports);
                        }
                        check.factory.apply(module, args);
                    }
                    this.setModuleLoaded(check.name, module);
                }
                return fullyLoaded;
            }
            loadRunners() {
                this.fromModuleRunners = [];
                for (var i = 0; i < this.runners.length; ++i) {
                    var runner = this.runners[i];
                    if (this.checkModule(runner)) {
                        this.runners.splice(i--, 1);
                    }
                }
                var moreRunners = this.fromModuleRunners.length > 0;
                if (moreRunners) {
                    this.runners = this.runners.concat(this.fromModuleRunners);
                }
                this.fromModuleRunners = null;
                if (moreRunners) {
                    this.loadRunners();
                }
            }
            debug() {
                if (this.runners.length > 0) {
                    for (var i = 0; i < this.runners.length; ++i) {
                        var runner = this.runners[i];
                        console.log("Runner waiting " + runner.name);
                        for (var j = 0; j < runner.dependencies.length; ++j) {
                            var dependency = runner.dependencies[j];
                            if (!this.isModuleLoaded(dependency.name)) {
                                this.recursiveWaitingDebug(dependency.name, 1);
                            }
                        }
                    }
                }
                else {
                    console.log("No runners remaining.");
                }
            }
            printLoaded() {
                console.log("Loaded Modules:");
                for (var p in this.loaded) {
                    if (this.loaded.hasOwnProperty(p)) {
                        console.log(p);
                    }
                }
            }
            printUnloaded() {
                console.log("Unloaded Modules:");
                for (var p in this.unloaded) {
                    if (this.unloaded.hasOwnProperty(p)) {
                        console.log(p);
                    }
                }
            }
            createFileFromLoaded(ignoredSources) {
                if (ignoredSources === undefined) {
                    ignoredSources = [];
                }
                var modules = "var jsnsOptions = jsnsOptions || {};\nvar jsnsDefine =" + jsnsDefine + "\nvar jsns = jsns || jsnsDefine(jsnsOptions);\nvar define = define || " + define + '\n';
                for (var i = 0; i < this.loadedOrder.length; ++i) {
                    var p = this.loadedOrder[i];
                    if (this.loaded.hasOwnProperty(p)) {
                        var mod = this.loaded[p];
                        modules += mod.definition.getModuleCode(ignoredSources);
                    }
                }
                return modules;
            }
            recursiveWaitingDebug(name, indent) {
                var indentStr = '';
                for (var i = 0; i < indent; ++i) {
                    indentStr += ' ';
                }
                var module = this.unloaded[name];
                if (module !== undefined) {
                    console.log(indentStr + module.name);
                    for (var j = 0; j < module.dependencies.length; ++j) {
                        var dependency = module.dependencies[j];
                        if (!this.isModuleLoaded(dependency.name)) {
                            this.recursiveWaitingDebug(dependency.name, indent + 4);
                        }
                    }
                }
                else {
                    console.log(indentStr + name + ' module not yet loaded.');
                }
            }
            runnerFunc() { }
        }
        class Loader {
            constructor(moduleManager) {
                if (moduleManager === undefined) {
                    moduleManager = new ModuleManager();
                }
                this.moduleManager = moduleManager;
            }
            define(name, dependencies, factory) {
                if (!this.moduleManager.isModuleDefined(name)) {
                    this.moduleManager.addModule(name, dependencies, factory);
                    this.moduleManager.loadRunners();
                }
            }
            amd(name, discoverFunc) {
                if (!this.moduleManager.isModuleDefined(name)) {
                    this.discoverAmd(discoverFunc, (dependencies, factory, amdFactory) => {
                        this.moduleManager.addModule(name, dependencies, factory, (def) => this.writeAmdFactory(amdFactory, def));
                    });
                    this.moduleManager.loadRunners();
                }
            }
            /**
             * Run a module, will execute the code in the module, the module must actually
             * run some code not just export function for this to have any effect.
             *
             * Can optionally provide a source, which can be used to filter out running modules at build time
             * for tree shaking.
             */
            run(name, source) {
                this.moduleManager.addRunner(name, source);
            }
            debug() {
                this.moduleManager.debug();
            }
            printLoaded() {
                this.moduleManager.printLoaded();
            }
            printUnloaded() {
                this.moduleManager.printUnloaded();
            }
            createFileFromLoaded(ignoredSources) {
                return this.moduleManager.createFileFromLoaded(ignoredSources);
            }
            writeAmdFactory(amdFactory, def) {
                return 'define("' + def.name + '", ' + def.getDependenciesArg(["require", "exports"]) + ', ' + amdFactory + ');\n';
            }
            require() {
            }
            discoverAmd(discoverFunc, callback) {
                var dependencies;
                var factory;
                discoverFunc(function (dep, fac) {
                    dependencies = dep;
                    factory = fac;
                });
                //Remove crap that gets added by tsc (require and exports)
                dependencies.splice(0, 2);
                //Fix up paths, remove leading ./ that tsc likes to add / need
                for (var i = 0; i < dependencies.length; ++i) {
                    var dep = dependencies[i];
                    if (dep[0] === '.' && dep[1] === '/') {
                        dependencies[i] = dep.substring(2);
                    }
                }
                callback(dependencies, function (exports, module, ...args) {
                    args.unshift(exports);
                    args.unshift(this.require);
                    factory.apply(this, args); //This is a bit weird here, it will be the module instance from the loader, since it sets that before calling this function.
                }, factory);
            }
        }
        //Return the instance
        return new Loader(new ModuleManager(options));
    }
var jsns = jsns || jsnsDefine(jsnsOptions);
var define = define || function (name, deps, factory) {
    jsns.amd(name, function (cbDefine) {
        cbDefine(deps, factory);
    });
}
