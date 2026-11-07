import asyncio, subprocess
from playwright.async_api import async_playwright

async def main():
    names = subprocess.check_output(['bash', '-c', "ls ~/workspace/hormuz-astra5/public/models/towers/ | sed 's/.glb//'"]).decode().split()
    print('models:', len(names), flush=True)
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path='/home/hatch/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell', args=['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'])
        pg = await b.new_page()
        pg.on('pageerror', lambda e: print('PAGEERROR:', str(e)[:150], flush=True))
        pg.on('console', lambda m: print('CONSOLE:', m.text[:150], flush=True) if m.type == 'error' else None)
        await pg.goto('http://localhost:3400/', wait_until='networkidle')
        await pg.wait_for_function('window.__ready === true', timeout=30000)
        await pg.evaluate('(names) => window.__renderAll(names)', names)
        print('done:', await pg.evaluate('window.__done'), 'errors:', await pg.evaluate('window.__errors'), flush=True)
        await b.close()
asyncio.run(main())
