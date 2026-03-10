{
  lib,
  stdenvNoCC,
  callPackage,
  bun,
  sysctl,
  makeBinaryWrapper,
  models-dev,
  ripgrep,
  installShellFiles,
  versionCheckHook,
  writableTmpDirAsHomeHook,
  node_modules ? callPackage ./node-modules.nix { },
}:
stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "legion";
  inherit (node_modules) version src;
  inherit node_modules;

  nativeBuildInputs = [
    bun
    installShellFiles
    makeBinaryWrapper
    models-dev
    writableTmpDirAsHomeHook
  ];

  configurePhase = ''
    runHook preConfigure

    cp -R ${finalAttrs.node_modules}/. .

    runHook postConfigure
  '';

  env.MODELS_DEV_API_JSON = "${models-dev}/dist/_api.json";
  env.LEGION_DISABLE_MODELS_FETCH = true;
  env.LEGION_VERSION = finalAttrs.version;
  env.LEGION_CHANNEL = "local";

  buildPhase = ''
    runHook preBuild

    cd ./packages/legion
    bun --bun ./script/build.ts --single --skip-install
    bun --bun ./script/schema.ts schema.json

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    install -Dm755 dist/legion-*/bin/legion $out/bin/legion
    install -Dm644 schema.json $out/share/legion/schema.json

    wrapProgram $out/bin/legion \
      --prefix PATH : ${
        lib.makeBinPath (
          [
            ripgrep
          ]
          # bun runs sysctl to detect if dunning on rosetta2
          ++ lib.optional stdenvNoCC.hostPlatform.isDarwin sysctl
        )
      }

    runHook postInstall
  '';

  postInstall = lib.optionalString (stdenvNoCC.buildPlatform.canExecute stdenvNoCC.hostPlatform) ''
    # trick yargs into also generating zsh completions
    installShellCompletion --cmd legion \
      --bash <($out/bin/legion completion) \
      --zsh <(SHELL=/bin/zsh $out/bin/legion completion)
  '';

  nativeInstallCheckInputs = [
    versionCheckHook
    writableTmpDirAsHomeHook
  ];
  doInstallCheck = true;
  versionCheckKeepEnvironment = [ "HOME" "LEGION_DISABLE_MODELS_FETCH" ];
  versionCheckProgramArg = "--version";

  passthru = {
    jsonschema = "${placeholder "out"}/share/legion/schema.json";
  };

  meta = {
    description = "The open source coding agent";
    homepage = "https://legion.dev/";
    license = lib.licenses.mit;
    mainProgram = "legion";
    inherit (node_modules.meta) platforms;
  };
})
