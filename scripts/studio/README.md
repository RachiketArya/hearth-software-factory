# Studio cloud runner

The trusted queue endpoint is `/api/studio-runner`. It is bound to one owner workspace by secret `STUDIO_OWNER_ID` and authenticated by `STUDIO_RUNNER_SECRET`. Sites dispatch additionally needs the existing Site bearer. Values are configured only in Sites runtime secrets and GitHub Actions secrets.

The executable runner and scheduled workflow live in `fabianchua6/chatjipiti-game/scripts/hearth` and `.github/workflows/hearth-studio.yml`. No Mac process or Codex automation is needed. GitHub schedules may be delayed; manual workflow dispatch checks immediately. GitHub may disable inactive public repository schedules after 60 days.

Owners create a Live mission targeting ChatJiPiTi Game, select a team containing frontend and QA, set a token budget and start. Collaborators can steer or pause. A pause is observed before the next model, validation or publish action. In-flight API calls can still spend tokens. Checkpoints and real usage are saved in the mission. After failure, the owner may resume; expired leases require pause/resume to fence the abandoned worker. Successful releases require executed rule, build and browser checks plus verification of the published source SHA.

Only new game paths are generated. Generated code runs in a disposable, network-isolated Docker container with no credentials, host socket or repository metadata. The host orchestrator never imports generated modules. The studio Worker reads immutable tested artifacts from the public `hearth-published` branch and preserves the Site access policy.
