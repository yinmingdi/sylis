build docker

```docker
docker build --platform linux/amd64 -t speech-service-base .
```


mount volume

```docker
docker run --platform linux/amd64 -v $(pwd):/app -p 8000:8000 -it --rm speech-service-base bash
```

run python app

```docker
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```