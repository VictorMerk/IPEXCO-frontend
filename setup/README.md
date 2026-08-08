# Back-End Docker Setup

## Docker

`backend_and_services` contains a Docker Compose file and four environments.
You must define the following parameters:

`docker-compose.yml`:

Replace `<absolute path to local folder>` with absolute paths to two **different**
folders on your home system. These folders are used by the back-end and the 
database to store the uploaded data.

`backend.env`:

- `JWT_KEY`: a random string that is used to generate the login tokens to authenticate 
    users
- `SERVICE_KEY`: a random string that is used to authenticate any registered 
    services, e.g. planner 

**Attention**: `SERVICE_KEY` in `backend.env` and the service environments must match.


`planner.env`/`explainer.env`/`property_checker.env`:

- `API_KEY`: a random string that is used to authenticate a request from the 
    back-end to a service
- `SERVICE_KEY`: a random string that is used to authenticate any registered 
    services, e.g. planner
- `MONGO_DB`: a unique name for the database used by the job scheduler of the service

**Attention**: If you register a new service in the web interface, then 
requested API Key and the `API_KEY` defined in the service environment 
must match.

## Setup on MacOS

On MacOS network mode `host` is not supported. Therefore, you need a few changes to make the docker-compose work.

1. Remove all the `network_mode: "host"` lines in the `docker-compose.yml` file.
2. In every `.env` file change the `MONGO_DB` value to `MONGO_DB=mongodb://mongo:27017/<whatever_you_want>`.


#### Docker images

The docker images are available on [DockerHub](https://hub.docker.com/repositories/eifler).

If you want to build the docker images yourself, please check out the 
READMEs in the following repositories:

- [Planner](https://github.com/r-eifler/planner-service)
- [Property Checker](https://github.com/r-eifler/property_checker_service)
- [Explainer](https://github.com/r-eifler/explainer-service)

#### Start Docker

To run all containers together run:

    docker compose up

