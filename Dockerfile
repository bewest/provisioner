FROM ubuntu:focal
MAINTAINER Ben West <bewest@gmail.com>

ENV DEBIAN_FRONTEND noninteractive
ENV INTERNAL_PORT=3737
ENV PORT=4747
ENV NODE_MAJOR=18

RUN apt-get update -y
RUN apt-get install -y ca-certificates gnupg wget curl git sudo
RUN sudo mkdir -p /etc/apt/keyrings && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg

RUN echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list

# RUN curl -sL https://deb.nodesource.com/setup_18.x | bash -

# RUN echo "deb http://ppa.launchpad.net/nginx/stable/ubuntu trusty main" | tee /etc/apt/sources.list.d/nginx.list
# RUN echo "deb-src http://ppa.launchpad.net/nginx/stable/ubuntu trusty main" | tee /etc/apt/sources.list.d/nginx.list
# RUN apt-key  adv --keyserver keyserver.ubuntu.com --recv-keys C300EE8C
RUN apt-get update
RUN apt-get install -y python software-properties-common nodejs build-essential nginx ruby
RUN apt-get install -y mongodb
# RUN npm install -g node-gyp
RUN npm install -g n
RUN n 16

ADD . /app

WORKDIR /app

# "configure nginx"
RUN erb nginx.conf.erb | tee /etc/nginx/nginx.conf
# clean things
# RUN cd /app && rm -rf node_modules
# RUN cd /app && npm cache clean
RUN cd /app && npm install
EXPOSE 4747
EXPOSE 3737
RUN /app/setup_docker_guest.sh
# forward request and error logs to docker log collector
# RUN ln -sf /dev/stdout /var/log/nginx/access.log
# RUN ln -sf /dev/stderr /var/log/nginx/error.log

CMD /app/start_container.sh
