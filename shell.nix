{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  packages = with pkgs; [
    git
    nodejs_22
    pandoc
    pnpm
  ];

  shellHook = ''
    export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
  '';
}
