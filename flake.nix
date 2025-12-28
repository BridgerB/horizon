{
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs?ref=nixos-unstable";
  };

  outputs = {
    self,
    nixpkgs,
  }: let
    pkgs = nixpkgs.legacyPackages.x86_64-linux;
  in
    with pkgs; {
      devShells.x86_64-linux.default = mkShell {
        packages = [nodejs_22 gdal];
      };
    };
}
