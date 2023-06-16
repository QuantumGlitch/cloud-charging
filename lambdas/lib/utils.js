exports.wait = async function (time) {
  return new Promise((resolve) => {
    setTimeout(resolve);
  });
};
