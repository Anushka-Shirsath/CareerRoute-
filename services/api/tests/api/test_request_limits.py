import asyncio
import httpx


def test_streamed_json_without_content_length_is_limited(app):
    async def exercise():
        async def chunks():
            yield b'{"email":"'
            for _ in range(7):
                yield b'a' * (1024 * 1024)
            yield b'"}'
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
            return await client.post('/api/v1/auth/login', content=chunks(), headers={'Content-Type': 'application/json'})

    assert asyncio.run(exercise()).status_code == 413
