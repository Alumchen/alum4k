ARG BASE_IMAGE=selenium/standalone-chromium:155.0-chromedriver-155.0-grid-4.50.0-20261010
FROM ${BASE_IMAGE}
USER root
RUN apt-get update && apt-get install -y --no-install-recommends fonts-noto-cjk xclip x11-utils socat && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /home/seluser/.alumai/chrome/Default /home/seluser/.alumai/downloads \
    && chown -R seluser:seluser /home/seluser/.alumai && chmod 700 /home/seluser/.alumai
COPY --chown=seluser:seluser browser-prefs.json /home/seluser/.alumai/chrome/Default/Preferences
USER seluser
