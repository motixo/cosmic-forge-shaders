# COSMIC Forge Shaders

Official shader pack for COSMIC Forge.

## Use the shaders

1. Install COSMIC Forge. [Installation guide](https://github.com/motixo/cosmic-forge#install)
2. Install the Forge compositor under **Settings → Patches**, then log out and back in.
3. Select an effect in the sidebar. Use the header refresh button to check for shader updates.

[Releases](https://github.com/motixo/cosmic-forge-shaders/releases) · [Changelog](CHANGELOG.md)

## Create a shader

Try Prism Glass by importing the bundled JSON from **Settings → Import effect**. [Prism pack](examples/prism.json)

To edit the shader, start with the separate JSON and `.frag` files. Select both together when you import. [Editable Prism files](examples/prism-files) · [Shader authoring guide](https://github.com/motixo/cosmic-forge/blob/main/docs/adding-effects.md)

To test and build the official pack, run these commands with Python 3.11 or newer.

```sh
python -m unittest discover -s tests -v
python scripts/package_effects.py --revision 1
```

A `glass-v<N>` tag publishes pack revision `N` after the checks pass.

## License

GPL-3.0-only. Ember's adapted flame code retains its upstream CC-BY-NC-SA terms.
[License](LICENSE) · [Credits](CREDITS.md)
